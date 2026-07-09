// server.js - Backend (Express)
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const supabase = require('./database');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

const SERVICOS = { 'Corte': 12, 'Barba': 8, 'Corte + Barba': 18, 'Sobrancelha': 5 };
const METODOS_PAGAMENTO = ['Dinheiro', 'MBWay'];

// Horário de funcionamento: fechado domingo (0) e segunda (1); sábado fecha às 16:00
const HORARIOS_SEMANA = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const HORARIOS_SABADO = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
const DIAS_FECHADOS = [0, 1];

// Slots possíveis para uma data YYYY-MM-DD ([] se a barbearia estiver fechada nesse dia)
function slotsParaData(data) {
    const diaSemana = new Date(`${data}T00:00:00`).getDay();
    if (DIAS_FECHADOS.includes(diaSemana)) return [];
    return diaSemana === 6 ? HORARIOS_SABADO : HORARIOS_SEMANA;
}

// Necessário na Vercel para o rate limiting ver o IP real do cliente (X-Forwarded-For)
app.set('trust proxy', 1);

// Configuração do CORS
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://127.0.0.1:5501', 'http://127.0.0.1:5502'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Accept']
}));

app.use(express.json());
app.use(cookieParser());

// Rate limiting (em memória: por instância serverless, suficiente como primeira barreira)
const limiterAgendar = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    message: { success: false, error: 'Demasiadas marcações num curto espaço de tempo. Tenta novamente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

const limiterLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: { success: false, error: 'Demasiadas tentativas de login. Tenta novamente dentro de 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Limites do dia (00:00 a 00:00 do dia seguinte) usados para filtrar por data
function limitesDoDia(data) {
    const inicio = `${data}T00:00:00`;
    const fim = `${data}T23:59:59.999`;
    return { inicio, fim };
}

// --- Autenticação simples do admin (token sem estado, derivado da ADMIN_PASSWORD) ---

function tokenAdminEsperado() {
    return crypto.createHmac('sha256', process.env.ADMIN_PASSWORD || '').update('admin-session').digest('hex');
}

function sessaoAdminValida(req) {
    const token = req.cookies && req.cookies.admin_session;
    if (!token || !process.env.ADMIN_PASSWORD) return false;
    const esperado = tokenAdminEsperado();
    return token.length === esperado.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
}

function exigirAdminPagina(req, res, next) {
    if (sessaoAdminValida(req)) return next();
    res.redirect('/admin-login.html');
}

function exigirAdminApi(req, res, next) {
    if (sessaoAdminValida(req)) return next();
    res.status(401).json({ error: 'Não autenticado' });
}

app.post('/admin/login', limiterLogin, (req, res) => {
    const { senha } = req.body;
    const esperada = process.env.ADMIN_PASSWORD || '';

    if (!senha || !esperada || senha.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(senha), Buffer.from(esperada))) {
        return res.status(401).json({ success: false, error: 'Password incorreta' });
    }

    res.cookie('admin_session', tokenAdminEsperado(), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({ success: true });
});

app.post('/admin/logout', (req, res) => {
    res.clearCookie('admin_session');
    res.json({ success: true });
});

// Rotas de páginas protegidas (registadas antes do static, para nunca serem servidas sem autenticação)
app.get(['/admin', '/admin.html'], exigirAdminPagina, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(['/admin-metricas', '/admin-metricas.html'], exigirAdminPagina, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-metricas.html'));
});

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rota para a página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para a página de marcação
app.get('/marcacao', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'marcacao.html'));
});

// Rota pública com o catálogo de serviços/preços, métodos de pagamento e horário de funcionamento
app.get('/config', (req, res) => {
    res.json({
        servicos: SERVICOS,
        metodosPagamento: METODOS_PAGAMENTO,
        horarios: {
            semana: HORARIOS_SEMANA,
            sabado: HORARIOS_SABADO,
            diasFechados: DIAS_FECHADOS
        }
    });
});

// Rota para obter horários ocupados de uma data específica
app.get('/horarios/:data', async (req, res) => {
    const data = req.params.data;
    console.log('Buscando horários para a data:', data);

    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        console.error('Data inválida:', data);
        return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD' });
    }

    const { inicio, fim } = limitesDoDia(data);

    const { data: rows, error } = await supabase
        .from('marcacoes')
        .select('data_hora')
        .gte('data_hora', inicio)
        .lte('data_hora', fim)
        .order('data_hora');

    if (error) {
        console.error('Erro ao buscar horários:', error);
        return res.status(500).json({ error: 'Erro ao buscar horários' });
    }

    const horariosOcupados = rows.map(row => new Date(row.data_hora).toISOString().substring(11, 16));
    console.log('Horários ocupados:', horariosOcupados);

    res.json(horariosOcupados);
});

// Rota para verificar dias totalmente ocupados
app.get('/dias-ocupados', async (req, res) => {
    const { data: rows, error } = await supabase
        .from('marcacoes')
        .select('data_hora');

    if (error) {
        console.error('Erro ao buscar dias ocupados:', error);
        return res.status(500).json({ error: 'Erro ao buscar dias ocupados' });
    }

    const contagemPorDia = {};
    rows.forEach(row => {
        const dia = row.data_hora.substring(0, 10);
        contagemPorDia[dia] = (contagemPorDia[dia] || 0) + 1;
    });

    // Um dia está cheio quando todas as vagas desse dia da semana estão preenchidas
    const diasOcupados = Object.keys(contagemPorDia).filter(dia => {
        const totalSlots = slotsParaData(dia).length;
        return totalSlots > 0 && contagemPorDia[dia] >= totalSlots;
    });
    console.log('Dias totalmente ocupados:', diasOcupados);

    res.json(diasOcupados);
});

// Rota para obter todas as reservas (admin)
app.get('/reservas', exigirAdminApi, async (req, res) => {
    const { data: rows, error } = await supabase
        .from('marcacoes')
        .select('id, nome, telefone, data_hora, servico, preco, pago, metodo_pagamento')
        .order('data_hora', { ascending: false });

    if (error) {
        console.error('Erro ao buscar reservas:', error);
        return res.status(500).json({ error: 'Erro ao buscar reservas' });
    }

    res.json(rows);
});

// Rota para obter reservas de uma data específica (admin)
app.get('/reservas/:data', exigirAdminApi, async (req, res) => {
    const data = req.params.data;

    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD' });
    }

    const { inicio, fim } = limitesDoDia(data);

    const { data: rows, error } = await supabase
        .from('marcacoes')
        .select('id, nome, telefone, data_hora, servico, preco, pago, metodo_pagamento')
        .gte('data_hora', inicio)
        .lte('data_hora', fim)
        .order('data_hora');

    if (error) {
        console.error('Erro ao buscar reservas:', error);
        return res.status(500).json({ error: 'Erro ao buscar reservas' });
    }

    res.json(rows);
});

// Rota para cancelar uma reserva (admin)
app.delete('/reservas/:id', exigirAdminApi, async (req, res) => {
    const id = req.params.id;
    console.log('Tentando cancelar reserva com ID:', id);

    if (!id || isNaN(parseInt(id))) {
        console.error('ID inválido:', id);
        return res.status(400).json({ error: 'ID de reserva inválido' });
    }

    const { data: rows, error } = await supabase
        .from('marcacoes')
        .delete()
        .eq('id', id)
        .select();

    if (error) {
        console.error('Erro ao cancelar reserva:', error);
        return res.status(500).json({ error: 'Erro ao cancelar reserva' });
    }

    console.log('Reservas afetadas:', rows.length);

    if (rows.length === 0) {
        return res.status(404).json({ error: 'Reserva não encontrada' });
    }

    res.json({ success: true, message: 'Reserva cancelada com sucesso' });
});

// Rota para marcar uma reserva como paga (admin)
app.patch('/reservas/:id/pagamento', exigirAdminApi, async (req, res) => {
    const id = req.params.id;
    const { metodo_pagamento } = req.body;

    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID de reserva inválido' });
    }

    if (!METODOS_PAGAMENTO.includes(metodo_pagamento)) {
        return res.status(400).json({ error: 'Método de pagamento inválido' });
    }

    const { data: rows, error } = await supabase
        .from('marcacoes')
        .update({ pago: true, metodo_pagamento })
        .eq('id', id)
        .select();

    if (error) {
        console.error('Erro ao registar pagamento:', error);
        return res.status(500).json({ error: 'Erro ao registar pagamento' });
    }

    if (rows.length === 0) {
        return res.status(404).json({ error: 'Reserva não encontrada' });
    }

    res.json({ success: true });
});

// Rota para registar uma venda de produto (admin)
app.post('/vendas-produtos', exigirAdminApi, async (req, res) => {
    const { produto, preco, metodo_pagamento } = req.body;

    if (!produto || typeof produto !== 'string' || !produto.trim()) {
        return res.status(400).json({ error: 'Produto é obrigatório' });
    }

    const precoNumerico = Number(preco);
    if (!Number.isFinite(precoNumerico) || precoNumerico <= 0) {
        return res.status(400).json({ error: 'Preço inválido' });
    }

    if (!METODOS_PAGAMENTO.includes(metodo_pagamento)) {
        return res.status(400).json({ error: 'Método de pagamento inválido' });
    }

    const { error } = await supabase
        .from('vendas_produtos')
        .insert({ produto: produto.trim(), preco: precoNumerico, metodo_pagamento });

    if (error) {
        console.error('Erro ao registar venda de produto:', error);
        return res.status(500).json({ error: 'Erro ao registar venda de produto' });
    }

    res.json({ success: true });
});

// Rota com as métricas agregadas de um mês (admin)
app.get('/admin/metricas', exigirAdminApi, async (req, res) => {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : new Date().toISOString().substring(0, 7);
    const inicio = `${mes}-01T00:00:00`;
    const [ano, mesNum] = mes.split('-').map(Number);
    const fim = new Date(ano, mesNum, 0, 23, 59, 59, 999).toISOString();

    const [marcacoesRes, vendasRes] = await Promise.all([
        supabase.from('marcacoes').select('preco, servico, metodo_pagamento').eq('pago', true).gte('data_hora', inicio).lte('data_hora', fim),
        supabase.from('vendas_produtos').select('preco, metodo_pagamento').gte('data', inicio).lte('data', fim)
    ]);

    if (marcacoesRes.error || vendasRes.error) {
        console.error('Erro ao calcular métricas:', marcacoesRes.error || vendasRes.error);
        return res.status(500).json({ error: 'Erro ao calcular métricas' });
    }

    const somarPorChave = (linhas, chave) => linhas.reduce((acc, linha) => {
        acc[linha[chave]] = (acc[linha[chave]] || 0) + Number(linha.preco);
        return acc;
    }, {});

    const totalMarcacoes = marcacoesRes.data.reduce((soma, linha) => soma + Number(linha.preco), 0);
    const totalProdutos = vendasRes.data.reduce((soma, linha) => soma + Number(linha.preco), 0);

    res.json({
        mes,
        marcacoes: {
            total: totalMarcacoes,
            quantidade: marcacoesRes.data.length,
            porMetodo: somarPorChave(marcacoesRes.data, 'metodo_pagamento'),
            porServico: somarPorChave(marcacoesRes.data, 'servico')
        },
        produtos: {
            total: totalProdutos,
            quantidade: vendasRes.data.length,
            porMetodo: somarPorChave(vendasRes.data, 'metodo_pagamento')
        },
        totalGeral: totalMarcacoes + totalProdutos
    });
});

// Rota para criar um novo agendamento
app.post('/agendar', limiterAgendar, async (req, res) => {
    const { nome, telefone, data_hora } = req.body;
    const servico = req.body.servico || 'Corte';

    if (!nome || !telefone || !data_hora) {
        return res.status(400).json({
            success: false,
            error: 'Todos os campos são obrigatórios'
        });
    }

    if (!Object.prototype.hasOwnProperty.call(SERVICOS, servico)) {
        return res.status(400).json({
            success: false,
            error: 'Serviço inválido'
        });
    }

    console.log('Dados recebidos para agendamento:', { nome, telefone, data_hora, servico });

    const data = data_hora.split(' ')[0];
    const hora = data_hora.split(' ')[1];

    if (!/^\d{2}:\d{2}$/.test(hora)) {
        return res.status(400).json({
            success: false,
            error: 'Formato de hora inválido'
        });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res.status(400).json({
            success: false,
            error: 'Formato de data inválido'
        });
    }

    // Rejeita dias em que a barbearia está fechada e horas fora dos slots do dia
    const slotsDoDia = slotsParaData(data);
    if (slotsDoDia.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'A barbearia está fechada nesse dia. Escolha de terça a sábado.'
        });
    }
    if (!slotsDoDia.includes(hora)) {
        return res.status(400).json({
            success: false,
            error: 'Hora fora do horário de funcionamento.'
        });
    }

    // Rejeita marcações no passado
    const agora = new Date();
    if (new Date(`${data}T${hora}:00`) < agora) {
        return res.status(400).json({
            success: false,
            error: 'Não é possível marcar num horário que já passou.'
        });
    }

    const { inicio, fim } = limitesDoDia(data);

    const { data: existentes, error: checkError } = await supabase
        .from('marcacoes')
        .select('id, data_hora')
        .gte('data_hora', inicio)
        .lte('data_hora', fim);

    if (checkError) {
        console.error('Erro ao verificar horário:', checkError);
        return res.status(500).json({
            success: false,
            error: 'Erro ao verificar disponibilidade do horário'
        });
    }

    const ocupado = existentes.some(row => new Date(row.data_hora).toISOString().substring(11, 16) === hora);

    if (ocupado) {
        console.log('Horário já ocupado:', { data, hora });
        return res.status(400).json({
            success: false,
            error: 'Este horário já está ocupado. Por favor, escolha outro horário.'
        });
    }

    const preco = SERVICOS[servico];

    const { data: inserido, error: insertError } = await supabase
        .from('marcacoes')
        .insert({ nome, telefone, data_hora, servico, preco, pago: false })
        .select('id')
        .single();

    if (insertError) {
        // 23505 = violação de unicidade (duas marcações simultâneas para o mesmo horário)
        if (insertError.code === '23505') {
            console.log('Conflito de marcação simultânea:', { data, hora });
            return res.status(400).json({
                success: false,
                error: 'Este horário já está ocupado. Por favor, escolha outro horário.'
            });
        }
        console.error('Erro ao criar agendamento:', insertError);
        return res.status(500).json({
            success: false,
            error: 'Erro ao criar agendamento'
        });
    }

    console.log('Agendamento criado com sucesso. ID:', inserido.id);
    res.json({
        success: true,
        id: inserido.id
    });
});

// Iniciar o servidor (apenas quando corrido diretamente, não quando importado pela função serverless)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Servidor rodando em http://localhost:${port}`);
    });
}

module.exports = app;
