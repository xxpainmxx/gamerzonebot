import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { RegistrationSystem } from '../systems/registrationSystem.ts';
import db from '../database/db.ts';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-registro')
        .setDescription('Envia o painel de registro oficial no canal configurado.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction: CommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Limpamos o ID anterior para forçar o RegistrationSystem a enviar uma nova mensagem
            await db.delete('register_main_message_id');
            
            await RegistrationSystem.init(interaction.client);
            
            await interaction.editReply({ content: '✅ Painel de registro enviado com sucesso!' });
        } catch (error) {
            console.error('[ERRO] Ao executar setup-registro:', error);
            await interaction.editReply({ content: '❌ Ocorreu um erro ao enviar o painel de registro.' });
        }
    }
};
