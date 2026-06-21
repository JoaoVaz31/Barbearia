// server.js - Backend (Express)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./database');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Configuração do CORS
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://127.0.0.1:5501', 'http://127.0.0.1:5502'],
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Accept']
}));

// Configuração do JSON parser
app.use(express.json());

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Limites do dia (00:00 a 00:00 do dia seguinte) usados para filtrar por data
function limitesDoDia(data) {
    const inicio = `${data}T00:00:00`;
    const fim = `${data}T23:59:59.999`;
    return { inicio, fim };
}

// Rota para a página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para a página de marcação
app.get('/marcacao', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'marcacao.html'));
});

// Rota para a página de administração
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

    const diasOcupados = Object.keys(contagemPorDia).filter(dia => contagemPorDia[dia] >= 8);
    console.log('Dias totalmente ocupados:', diasOcupados);

    res.json(diasOcupados);
});

// Rota para obter todas as reservas
app.get('/reservas', async (req, res) => {
    const { data: rows, error } = await supabase
        .from('marcacoes')
        .select('id, nome, telefone, data_hora')
        .order('data_hora', { ascending: false });

    if (error) {
        console.error('Erro ao buscar reservas:', error);
        return res.status(500).json({ error: 'Erro ao buscar reservas' });
    }

    res.json(rows);
});

// Rota para obter reservas de uma data específica
app.get('/reservas/:data', async (req, res) => {
    const data = req.params.data;

    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD' });
    }

    const { inicio, fim } = limitesDoDia(data);

    const { data: rows, error } = await supabase
        .from('marcacoes')
        .select('id, nome, telefone, data_hora')
        .gte('data_hora', inicio)
        .lte('data_hora', fim)
        .order('data_hora');

    if (error) {
        console.error('Erro ao buscar reservas:', error);
        return res.status(500).json({ error: 'Erro ao buscar reservas' });
    }

    res.json(rows);
});

// Rota para cancelar uma reserva
app.delete('/reservas/:id', async (req, res) => {
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

// Rota para criar um novo agendamento
app.post('/agendar', async (req, res) => {
    const { nome, telefone, data_hora } = req.body;

    if (!nome || !telefone || !data_hora) {
        return res.status(400).json({
            success: false,
            error: 'Todos os campos são obrigatórios'
        });
    }

    console.log('Dados recebidos para agendamento:', { nome, telefone, data_hora });

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

    const { data: inserido, error: insertError } = await supabase
        .from('marcacoes')
        .insert({ nome, telefone, data_hora })
        .select('id')
        .single();

    if (insertError) {
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
