# Backup automático no Google Drive

O sistema faz sozinho, todo dia às 03:00, uma cópia do banco e das fotos (`m2-backup-AAAA-MM-DD_HHMM.tar.gz`):
- guarda as **7 últimas** cópias no servidor;
- envia cada cópia para a pasta **M2-Backups** do seu Google Drive;
- apaga do Drive as cópias com mais de **30 dias**. Elas vão para a lixeira do Drive, não somem de vez.

Em **Configurações → Backup** (só para administradores) você vê a situação do último backup, clica em **Fazer backup agora** e baixa qualquer cópia.

A permissão pedida ao Google é a mais restrita que existe (`drive.file`): o sistema **só enxerga os arquivos que ele mesmo criou**. Ele não consegue ler nem apagar o resto do seu Drive.

Para ligar o envio ao Drive são 3 etapas, feitas uma vez só (uns 15 minutos).

---

## Etapa 1: criar a chave do Google (Google Cloud, gratuito)

O Google exige que cada sistema tenha sua própria chave. A chave compartilhada do rclone está sendo desativada em 2026.

1. Acesse https://console.cloud.google.com/ com a conta Google onde quer guardar os backups.
2. No topo, clique no seletor de projeto, depois em **Novo projeto**. Nome: `M2 Backup`. Clique em **Criar** e selecione o projeto criado.
3. Menu **APIs e serviços → Biblioteca**. Procure **Google Drive API** e clique em **Ativar**.
4. Menu **APIs e serviços → Tela de consentimento OAuth** (em alguns painéis, **Google Auth Platform**). Clique em **Começar** e preencha:
   - Nome do app: `M2 Backup` · E-mail de suporte: o seu
   - Público: **Externo**
   - E-mail de contato: o seu
   - Aceite os termos e clique em **Criar**.
5. Em **Público** (Audience), clique em **Publicar app** e confirme, para ficar **Em produção**.
   Isso é importante: em modo "Teste", o Google derruba a autorização a cada 7 dias.
6. Em **Clientes** (ou **Credenciais → Criar credenciais → ID do cliente OAuth**):
   - Tipo de aplicativo: **App para computador** (Desktop app)
   - Nome: `M2 Backup rclone`
   - Clique em **Criar**.
7. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e a **Chave secreta do cliente**. Guarde os dois.

## Etapa 2: autorizar e gerar o token (no seu Mac)

1. Abra o **Terminal** do Mac. O rclone já está instalado; se for outro computador, rode `brew install rclone`.
2. Rode o comando abaixo **trocando** `SEU_ID` e `SEU_SEGREDO` pelos valores da etapa 1 (mantenha as aspas):
   ```bash
   rclone authorize "drive" "$(printf '{"client_id":"SEU_ID","client_secret":"SEU_SEGREDO","scope":"drive.file"}' | base64 | tr -d '=\n' | tr '+/' '-_')"
   ```
3. O navegador abre. Entre com a **mesma conta Google** e clique em **Permitir**.
   - Se aparecer "O Google não verificou este app", clique em **Avançado → Acessar M2 Backup**. O app é seu, criado na etapa 1.
4. Volte ao Terminal. Vai aparecer algo assim:
   ```
   Paste the following into your remote machine --->
   {"access_token":"ya29....","token_type":"Bearer","refresh_token":"1//0....","expiry":"2026-..."}
   <---End paste
   ```
   Copie **somente a linha que começa com `{` e termina com `}`**. Esse é o token.

O token dá acesso aos arquivos de backup no seu Drive. Trate como uma senha: não mande por e-mail nem por WhatsApp.

## Etapa 3: colocar no Portainer

1. No Portainer, abra **Stacks → m2-veiculos → Editor**.
2. Em **Environment variables**, adicione:

   | Nome | Valor |
   | --- | --- |
   | `BACKUP_GDRIVE_CLIENT_ID` | o ID do cliente da etapa 1 |
   | `BACKUP_GDRIVE_CLIENT_SECRET` | a chave secreta da etapa 1 |
   | `BACKUP_GDRIVE_TOKEN` | o token da etapa 2 (a linha inteira com `{ }`) |

   Opcionais: `BACKUP_HORA` (padrão `03:00`), `BACKUP_DIAS` (padrão `30`), `BACKUP_PASTA` (padrão `M2-Backups`).
3. Se a stack foi criada pelo **Web editor**, atualize também o texto do compose com o [`docker-compose.yml`](../docker-compose.yml) mais recente. Ele precisa ter as linhas `BACKUP_...` em `environment`.
4. Clique em **Update the stack** e marque **Re-pull image and redeploy**.
5. No sistema, vá em **Configurações → Backup → Fazer backup agora**.
   - Deve aparecer **✓ enviado** e o selo verde "Ok · enviado ao Google Drive".
   - No Google Drive, abra **Meu Drive → M2-Backups** e confira o arquivo.

Não crie a pasta `M2-Backups` à mão no Drive. Com a permissão restrita, o sistema não enxerga pastas que ele não criou, e criaria outra com o mesmo nome. Deixe que ele crie.

---

## Restaurar um backup do Drive

1. Baixe o arquivo `m2-backup-....tar.gz` do Drive (ou em **Configurações → Backup → Baixar**).
2. No Mac, dê dois cliques para extrair. Dentro estão `m2.db`, a pasta `uploads/` e um `LEIA-ME.txt`.
3. No servidor, com a stack **parada**, copie os arquivos para o volume. Mande o arquivo para o servidor (`scp`) e rode:
   ```bash
   mkdir -p /root/restaurar && tar -xzf m2-backup-AAAA-MM-DD_HHMM.tar.gz -C /root/restaurar
   docker run --rm -v m2seminovos_data:/data -v /root/restaurar:/r alpine sh -c "cp /r/m2.db /data/m2.db && rm -f /data/m2.db-wal /data/m2.db-shm && rm -rf /data/uploads && cp -r /r/uploads /data/uploads && chown -R 1000:1000 /data"
   ```
4. Inicie a stack de novo.

## Problemas comuns

| Mensagem em Configurações → Backup | O que fazer |
| --- | --- |
| "a autorização do Google está inválida ou expirou" | Gere o token de novo (etapa 2) e atualize `BACKUP_GDRIVE_TOKEN`. Confira se o app está **Em produção** (etapa 1, item 5). |
| "o Client ID ou o Client Secret do Google não conferem com o token" | O token precisa ser gerado com o mesmo ID e chave que estão no Portainer. |
| "o Google Drive está sem espaço" | Libere espaço no Drive ou diminua `BACKUP_DIAS`. Lembre de esvaziar a lixeira do Drive. |
| "sem conexão com o Google Drive no momento" | Problema passageiro de rede. O próximo backup tenta de novo, e a cópia local foi feita. |
| Selo "Ok · só no servidor" | O envio ao Drive não está configurado: faltam as variáveis da etapa 3. |
