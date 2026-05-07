import { Events, Interaction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder, TextChannel, GuildMember } from 'discord.js';
import db from '../database/db.ts';
import config from '../config/config.json' assert { type: 'json' };
import { CanvasHelper } from '../utils/canvasHelper.ts';

export default {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        // 1. Comando Slash
        if (interaction.isChatInputCommand()) {
            const command = (interaction.client as any).commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
            }
        }

        // 2. Submissão de Modal
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'registro_modal') {
                // Garantir resposta rápida ao Discord
                await interaction.deferReply({ ephemeral: true }).catch(() => null);

                const nome = interaction.fields.getTextInputValue('nome_completo');
                const discordId = interaction.fields.getTextInputValue('id_discord');
                const indicacao = interaction.fields.getTextInputValue('quem_indicou') || 'Ninguém';

                // Verificar se já está registrado ou pendente
                const status = await db.get(`registro_${interaction.user.id}`);
                if (status) {
                    return interaction.editReply({ content: 'Você já possui um registro ou pedido pendente!' });
                }

                // Salvar dados temporários no DB
                await db.set(`pendente_${interaction.user.id}`, { nome, discordId, indicacao, timestamp: Date.now() });

                // Embed para o canal de aprovação
                const canalAprovacao = interaction.client.channels.cache.get(config.channels.register) as TextChannel;
                if (!canalAprovacao) {
                    console.error(`[ERRO] Canal de aprovação não encontrado (ID: ${config.channels.register})`);
                    return interaction.editReply({ content: 'Erro interno: Canal de aprovação não configurado pela Staff.' });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📄 Novo Registro Pendente')
                    .setColor(config.colors.main as any)
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 Nome', value: nome, inline: true },
                        { name: '🆔 ID Discord', value: discordId, inline: true },
                        { name: '🔗 Indicação', value: indicacao, inline: true },
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

                try {
                    await canalAprovacao.send({ embeds: [embed], components: [row] });
                    await interaction.editReply({ content: 'Seu formulário foi enviado com sucesso! Aguarde a aprovação da staff.' });
                } catch (error: any) {
                    console.error(`[ERRO] Falha ao enviar para o canal de aprovação: ${error.message}`);
                    await interaction.editReply({ content: 'Ocorreu um erro ao enviar seu registro. Contate um administrador.' });
                }
            }
        }

        // 3. Botões de Aprovação/Reprovação
        if (interaction.isButton()) {
            const [action, userId] = interaction.customId.split('_');
            if (action !== 'aprovar' && action !== 'reprovar') return;

            // Diferir a atualização para dar tempo ao Canvas
            try {
                await interaction.deferUpdate().catch(() => null);
            } catch (e) {}

            // Verificar permissões (Manage Roles)
            if (!(interaction.member as any).permissions.has('ManageRoles')) {
                return interaction.followUp({ content: 'Você não tem permissão para gerenciar registros!', ephemeral: true });
            }

            const pendente = await db.get(`pendente_${userId}`);
            if (!pendente) {
                return interaction.followUp({ content: 'Dados do registro não encontrados ou já processados.', ephemeral: true });
            }

            const targetUser = await interaction.client.users.fetch(userId).catch(() => null);
            if (!targetUser) return interaction.followUp({ content: 'Usuário não encontrado no Discord.', ephemeral: true });

            if (action === 'aprovar') {
                // Lógica de Aprovação
                await db.set(`registro_${userId}`, { ...pendente, status: 'aprovado' });
                await db.delete(`pendente_${userId}`);

                // Salvar indicação p/ futuro ranking
                if (pendente.indicacao !== 'Ninguém') {
                    await db.push(`indicacoes_${pendente.indicacao}`, userId);
                }

                // Atribuir cargo
                const member = interaction.guild?.members.cache.get(userId);
                if (member) {
                    const role = interaction.guild?.roles.cache.get(config.roles.registered);
                    if (role) {
                        await member.roles.add(role).catch(err => console.error(`[ERRO] Ao dar cargo: ${err.message}`));
                    } else {
                        console.warn(`[AVISO] Cargo de registro (ID: ${config.roles.registered}) não encontrado no servidor.`);
                    }
                }

                // Gerar Card Canvas
                const cardBuffer = await CanvasHelper.createStatusCard(targetUser, 'APROVADO', pendente.nome);
                const attachment = new AttachmentBuilder(cardBuffer, { name: 'aprovado.png' });

                // Enviar Log
                const logChannel = interaction.client.channels.cache.get(config.channels.logs) as TextChannel;
                if (logChannel) {
                    await logChannel.send({ 
                        content: `✅ Registro de **${pendente.nome}** (${userId}) aprovado por ${interaction.user.tag}`,
                        files: [attachment]
                    }).catch(err => console.error(`[ERRO] Ao enviar log: ${err.message}`));
                } else {
                    console.warn(`[AVISO] Canal de logs (ID: ${config.channels.logs}) não encontrado.`);
                }

                // Enviar DM
                await targetUser.send({ content: `Parabéns! Seu registro em **${interaction.guild?.name}** foi aprovado!`, files: [attachment] }).catch(() => null);

                await interaction.editReply({ content: `✅ Registro aprovado por ${interaction.user.tag}`, embeds: [], components: [] });

            } else {
                // Lógica de Reprovação
                await db.delete(`pendente_${userId}`);

                const cardBuffer = await CanvasHelper.createStatusCard(targetUser, 'REPROVADO', pendente.nome);
                const attachment = new AttachmentBuilder(cardBuffer, { name: 'reprovado.png' });

                const logChannel = interaction.client.channels.cache.get(config.channels.logs) as TextChannel;
                if (logChannel) {
                    await logChannel.send({ 
                        content: `❌ Registro de **${pendente.nome}** (${userId}) reprovado por ${interaction.user.tag}`,
                        files: [attachment]
                    }).catch(err => console.error(`[ERRO] Ao enviar log: ${err.message}`));
                }

                await targetUser.send({ content: `Lamentamos, seu registro em **${interaction.guild?.name}** foi reprovado pela staff.`, files: [attachment] }).catch(() => null);

                await interaction.editReply({ content: `❌ Registro reprovado por ${interaction.user.tag}`, embeds: [], components: [] });
            }
        }
    },
};
