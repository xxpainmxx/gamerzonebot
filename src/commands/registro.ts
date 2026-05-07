import { SlashCommandBuilder, CommandInteraction, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('registro')
        .setDescription('Inicie seu processo de registro no servidor.'),
    async execute(interaction: CommandInteraction) {
        // Criar o Modal
        const modal = new ModalBuilder()
            .setCustomId('registro_modal')
            .setTitle('Formulário de Registro');

        // Inputs
        const nomeInput = new TextInputBuilder()
            .setCustomId('nome_completo')
            .setLabel('Nome Completo')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Digite seu nome aqui...')
            .setRequired(true);

        const idInput = new TextInputBuilder()
            .setCustomId('id_discord')
            .setLabel('Confirme seu ID do Discord')
            .setStyle(TextInputStyle.Short)
            .setValue(interaction.user.id)
            .setRequired(true);

        const indicacaoInput = new TextInputBuilder()
            .setCustomId('quem_indicou')
            .setLabel('Quem te indicou?')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Nome ou ID de quem indicou (Opcional)')
            .setRequired(false);

        // Adicionar ao modal
        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(nomeInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(idInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(indicacaoInput)
        );

        // Mostrar o modal
        await interaction.showModal(modal);
    },
};
