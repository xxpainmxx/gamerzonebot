import { Events, Interaction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, TextChannel, UserSelectMenuBuilder } from 'discord.js';
import db from '../database/db.ts';
import config from '../config/config.json' assert { type: 'json' };
import { CanvasHelper } from '../utils/canvasHelper.ts';
import { ModalHelper } from '../utils/modalHelper.ts';

export default {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        // 0. Botão de "Fazer Registro" ou Comando Slash /registro
        if (
            (interaction.isButton() && interaction.customId === 'open_register_modal') ||
            (interaction.isChatInputCommand() && interaction.commandName === 'registro')
        ) {
            try {
                // Verificar se já está registrado
                const status = await db.get(`registro_${interaction.user.id}`);
                if (status) {
                    return (interaction as any).reply({ content: 'Você já possui um registro aprovado!', ephemeral: true }).catch(() => null);
                }

                // Envia o Menu de Seleção de Usuário para Indicação
                const select = new UserSelectMenuBuilder()
                    .setCustomId('selecionar_indicacao')
                    .setPlaceholder('Selecione quem te indicou (ou clique no botão abaixo)')
                    .setMinValues(1)
                    .setMaxValues(1);

                const rowSelect = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select);
                const rowButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId('registro_sem_indicacao')
                        .setLabel('Ninguém me indicou')
                        .setStyle(ButtonStyle.Secondary)
                );

                return await (interaction as any).reply({
                    content: '✨ **ETAPA 1:** Quem te indicou para o servidor?',
                    components: [rowSelect, rowButton],
                    ephemeral: true
                }).catch((e: any) => console.error('[ERRO] Ao iniciar indicação:', e));
            } catch (e) {
                console.error('[ERRO] No fluxo inicial de registro:', e);
            }
        }

        // 1. Tratamento da Seleção de Indicação
        if (interaction.isUserSelectMenu() && interaction.customId === 'selecionar_indicacao') {
            try {
                const selectedUserId = interaction.values[0];
                const indicator = interaction.users.get(selectedUserId);

                if (selectedUserId === interaction.user.id) {
                    return interaction.reply({ content: '❌ Você não pode indicar a si mesmo!', ephemeral: true }).catch(() => null);
                }
                if (indicator?.bot) {
                    return interaction.reply({ content: '❌ Você não pode ser indicado por um Bot!', ephemeral: true }).catch(() => null);
                }

                const modal = ModalHelper.createRegisterModal(interaction.user.id);
                modal.setCustomId(`registro_modal:${selectedUserId}`); 
                
                return await interaction.showModal(modal).catch((e: any) => console.error('[ERRO] Ao mostrar modal (com indicação):', e));
            } catch (e) {
                console.error('[ERRO] No tratamento de seleção de indicação:', e);
            }
        }

        // --- SISTEMA DE LIVE (INTERAÇÕES) ---
        if (interaction.isButton() && interaction.customId === 'toggle_live_system') {
            try {
                const current = await db.get('live_system_enabled') ?? config.liveSystem.enabled;
                await db.set('live_system_enabled', !current);
                return (interaction as any).update({ content: `✅ Sistema de Live ${!current ? 'ATIVADO' : 'DESATIVADO'}!`, embeds: [], components: [] }).catch(() => null);
            } catch (e) {
                console.error('[ERRO] Ao alternar sistema de live:', e);
            }
        }

        if (interaction.isButton() && interaction.customId === 'set_live_role') {
            return (interaction as any).reply({ content: '💡 **Dica:** Atualmente você pode definir o ID do cargo diretamente no arquivo `config.json` (campo `roles.live`). Em breve teremos suporte para seleção via menu!', ephemeral: true }).catch(() => null);
        }

        // 2. Botão "Sem Indicação"
        if (interaction.isButton() && interaction.customId === 'registro_sem_indicacao') {
            try {
                const modal = ModalHelper.createRegisterModal(interaction.user.id);
                modal.setCustomId('registro_modal:none');
                return await interaction.showModal(modal).catch((e: any) => console.error('[ERRO] Ao mostrar modal (sem indicação):', e));
            } catch (e) {
                console.error('[ERRO] No botão sem indicação:', e);
            }
        }

        // 3. Submissão de Modal
        if (interaction.isModalSubmit() && interaction.customId.startsWith('registro_modal')) {
            try {
                // Deferir o MAIS RÁPIDO POSSÍVEL
                await interaction.deferReply({ ephemeral: true }).catch(() => null);

                const indicatorId = interaction.customId.split(':')[1];
                const nome = interaction.fields.getTextInputValue('nome_completo');
                const discordId = interaction.fields.getTextInputValue('id_discord');
                
                let indicacaoText = 'Nenhuma';
                let indicatorMention = 'Ninguém';

                if (indicatorId && indicatorId !== 'none') {
                    const indicatorUser = await interaction.client.users.fetch(indicatorId).catch(() => null);
                    if (indicatorUser) {
                        indicacaoText = indicatorUser.tag;
                        indicatorMention = `<@${indicatorId}>`;
                    }
                }

                const status = await db.get(`registro_${interaction.user.id}`);
                if (status) {
                    return interaction.editReply({ content: 'Você já possui um registro aprovado!' }).catch(() => null);
                }

                await db.set(`pendente_${interaction.user.id}`, { 
                    nome, 
                    discordId, 
                    indicacaoId: indicatorId === 'none' ? null : indicatorId,
                    indicacaoNome: indicacaoText,
                    timestamp: Date.now() 
                });

                const canalAprovacao = interaction.client.channels.cache.get(config.channels.register) as TextChannel;
                if (!canalAprovacao) {
                    return interaction.editReply({ content: 'Erro interno: Canal de aprovação não configurado.' }).catch(() => null);
                }

                const embed = new EmbedBuilder()
                    .setTitle('📄 Novo Registro Pendente')
                    .setColor(config.colors.main as any)
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 Nome', value: nome, inline: true },
                        { name: '🆔 Discord ID', value: discordId, inline: true },
                        { name: '📨 Indicado por', value: indicacaoText, inline: true },
                        { name: '👥 Menção', value: indicatorMention, inline: true },
                        { name: '📅 Data', value: new Date().toLocaleDateString('pt-BR'), inline: true }
                    )
                    .setFooter({ text: `Solicitado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`aprovar_${interaction.user.id}`)
                        .setLabel('Aprovar')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(`reprovar_${interaction.user.id}`)
                        .setLabel('Reprovar')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

                await canalAprovacao.send({ embeds: [embed], components: [row] });
                await interaction.editReply({ content: '✅ Seu formulário foi enviado com sucesso! Aguarde a aprovação da staff.' }).catch(() => null);
            } catch (error: any) {
                console.error(`[ERRO] No processamento de modal:`, error);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: 'Ocorreu um erro ao processar seu registro.' }).catch(() => null);
                }
            }
        }

        // 4. Botões de Aprovação/Reprovação (Staff)
        if (interaction.isButton()) {
            const parts = interaction.customId.split('_');
            const action = parts[0];
            const userId = parts[1];

            if (action !== 'aprovar' && action !== 'reprovar') return;

            try {
                // Deferir atualização IMEDIATAMENTE
                await interaction.deferUpdate().catch(() => null);

                if (!(interaction.member as any).permissions.has('ManageRoles')) {
                    return interaction.followUp({ content: 'Você não tem permissão para gerenciar registros!', ephemeral: true }).catch(() => null);
                }

                const pendente = await db.get(`pendente_${userId}`);
                if (!pendente) {
                    return interaction.editReply({ content: '❌ Este registro já foi processado ou expirou.', embeds: [], components: [] }).catch(() => null);
                }

                const targetUser = await interaction.client.users.fetch(userId).catch(() => null);
                if (!targetUser) return interaction.editReply({ content: '❌ Usuário não encontrado no Discord.', embeds: [], components: [] }).catch(() => null);

                if (action === 'aprovar') {
                    await db.set(`registro_${userId}`, { ...pendente, status: 'aprovado', approvedBy: interaction.user.id });
                    await db.delete(`pendente_${userId}`);

                    if (pendente.indicacaoId) {
                        await db.add(`ranking_indicacoes.${pendente.indicacaoId}`, 1);
                    }

                    const member = interaction.guild?.members.cache.get(userId);
                    if (member) {
                        const role = interaction.guild?.roles.cache.get(config.roles.registered);
                        if (role) await member.roles.add(role).catch(() => null);
                    }

                    const cardBuffer = await CanvasHelper.createStatusCard(targetUser, 'APROVADO', pendente.nome);
                    const attachment = new AttachmentBuilder(cardBuffer, { name: 'aprovado.png' });

                    const logChannel = interaction.client.channels.cache.get(config.channels.logs) as TextChannel;
                    if (logChannel) {
                        await logChannel.send({ 
                            content: `✅ Registro de **${pendente.nome}** (${userId}) aprovado por ${interaction.user.tag}`,
                            files: [attachment]
                        }).catch(() => null);
                    }

                    await targetUser.send({ content: `✅ Seu registro em **${interaction.guild?.name}** foi aprovado!`, files: [attachment] }).catch(() => null);
                    await interaction.editReply({ content: `✅ Registro de ${targetUser.tag} aprovado por ${interaction.user.tag}`, embeds: [], components: [] }).catch(() => null);

                } else {
                    await db.delete(`pendente_${userId}`);

                    const cardBuffer = await CanvasHelper.createStatusCard(targetUser, 'REPROVADO', pendente.nome);
                    const attachment = new AttachmentBuilder(cardBuffer, { name: 'reprovado.png' });

                    const logChannel = interaction.client.channels.cache.get(config.channels.logs) as TextChannel;
                    if (logChannel) {
                        await logChannel.send({ 
                            content: `❌ Registro de **${pendente.nome}** (${userId}) reprovado por ${interaction.user.tag}`,
                            files: [attachment]
                        }).catch(() => null);
                    }

                    await targetUser.send({ content: `❌ Seu registro em **${interaction.guild?.name}** foi reprovado pela staff.`, files: [attachment] }).catch(() => null);
                    await interaction.editReply({ content: `❌ Registro de ${targetUser.tag} reprovado por ${interaction.user.tag}`, embeds: [], components: [] }).catch(() => null);
                }
            } catch (error) {
                console.error('[ERRO] No processamento de botões staff:', error);
            }
        }
    },
};
