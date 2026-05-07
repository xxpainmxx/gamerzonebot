import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- SERVIDOR WEB (KEEP ALIVE) ---
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
    res.send('Bot de Registro está ONLINE! 🚀');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[STATUS] Servidor Keep-Alive rodando na porta ${PORT}`);
});

// --- CLIENTE DISCORD ---
export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.User, Partials.GuildMember, Partials.Message]
});

// Extensão do cliente para comandos
(client as any).commands = new Collection();

// --- HANDLERS ---
const loadHandlers = async () => {
    // Carregar Eventos
    const eventsPath = join(__dirname, 'src', 'events');
    const eventFiles = readdirSync(eventsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    for (const file of eventFiles) {
        const { default: event } = await import(`./src/events/${file}`);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }

    // Carregar Comandos
    const commandsPath = join(__dirname, 'src', 'commands');
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    for (const file of commandFiles) {
        const { default: command } = await import(`./src/commands/${file}`);
        (client as any).commands.set(command.data.name, command);
    }

    console.log(`[SISTEMA] ${eventFiles.length} eventos e ${(client as any).commands.size} comandos carregados.`);
};

// Iniciar Bot
const start = async () => {
    await loadHandlers();
    
    if (!process.env.DISCORD_TOKEN) {
        console.error('[ERRO] DISCORD_TOKEN não encontrado no .env');
        return;
    }

    try {
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('[ERRO] Falha ao logar no Discord:', error);
    }
};

start();
