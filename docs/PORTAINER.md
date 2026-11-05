# Instalar o M2 Seminovos no Portainer

O sistema roda num único container com banco SQLite. Os dados (banco e fotos) ficam no volume `m2seminovos_data`.

A imagem é montada automaticamente pelo GitHub a cada atualização do `main`, e o Portainer só precisa baixá-la:
`ghcr.io/netsalobo-alt/m2-veiculos:latest` (servidores Intel/AMD ou ARM).

## 1. Antes de começar (uma vez só)

1. **Imagem pública no GitHub.** Depois que a primeira imagem for publicada (aba **Actions** do repositório, workflow "Imagem Docker" verde):
   - abra https://github.com/netsalobo-alt?tab=packages, clique em **m2-veiculos**;
   - vá em **Package settings** e, em **Danger Zone**, escolha **Change visibility → Public**.

   Se preferir manter a imagem privada, cadastre o registro no Portainer em **Registries → Add registry → Custom registry**, com URL `ghcr.io`, seu usuário do GitHub e um token com permissão `read:packages`.
2. **Um domínio** apontando para o servidor, por exemplo `sistema.m2seminovos.com.br`. É necessário para o HTTPS, os links de assinatura e a OLX.

## 2. Criar a stack

1. No Portainer, abra **Stacks → Add stack**.
2. Em **Name**, use `m2seminovos`.
3. Escolha um método:
   - **Repository** (recomendado):
     - Repository URL: `https://github.com/netsalobo-alt/m2-veiculos`
     - Repository reference: `refs/heads/main`
     - Compose path: `docker-compose.yml`
   - **Web editor:** cole o conteúdo do arquivo [`docker-compose.yml`](../docker-compose.yml).
4. Em **Environment variables**, adicione:

   | Nome | Valor | Obrigatória |
   | --- | --- | --- |
   | `ADMIN_PASSWORD` | senha forte do administrador | sim |
   | `ADMIN_EMAIL` | e-mail do administrador (padrão `admin@m2seminovos.com.br`) | não |
   | `PORTA` | porta do servidor (padrão `3000`) | não |
   | `FIPE_TOKEN` | token da FIPE API (consulta por placa) | não |

   O administrador é criado **só na primeira vez** que o sistema sobe com o banco vazio. Depois disso a senha se troca pelo próprio sistema, em *Trocar senha*.
5. Clique em **Deploy the stack**.
6. Em **Containers**, o `m2-seminovos` deve ficar **healthy** em até 1 minuto. Teste em `http://IP-DO-SERVIDOR:3000`.

## 3. HTTPS (obrigatório em produção)

O login usa cookie de sessão, e os links de assinatura e a OLX exigem `https`. Coloque um proxy reverso na frente do container.

**Nginx Proxy Manager** (o mais comum junto com o Portainer):
- **Proxy Hosts → Add Proxy Host**:
  - Domain: `sistema.m2seminovos.com.br`
  - Scheme: `http`
  - Forward Hostname/IP: o IP do servidor (ou `m2-seminovos`, se estiverem na mesma rede Docker)
  - Forward Port: `3000`
  - marque **Block Common Exploits** e **Websockets Support**
- Aba **SSL**: **Request a new SSL Certificate**, e marque **Force SSL** e **HTTP/2**.
- Aba **Advanced**, para aceitar fotos grandes:
  ```
  client_max_body_size 50m;
  ```

**Traefik:** se você já usa Traefik, adicione estas labels ao serviço `m2` (troque o domínio e o nome do certresolver) e remova a seção `ports`:
```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.m2.rule=Host(`sistema.m2seminovos.com.br`)
      - traefik.http.routers.m2.entrypoints=websecure
      - traefik.http.routers.m2.tls.certresolver=letsencrypt
      - traefik.http.services.m2.loadbalancer.server.port=3000
```

O sistema já confia no proxy (`trust proxy`) e marca o cookie como `Secure` quando o acesso é por HTTPS.

## 4. Primeiro acesso

1. Abra `https://sistema.m2seminovos.com.br/login` e entre com o `ADMIN_EMAIL` e o `ADMIN_PASSWORD`.
2. Em **Configurações**:
   - **Dados da empresa** e **WhatsApp da loja**;
   - **Endereço público do sistema**: `https://sistema.m2seminovos.com.br` (base dos links de assinatura e das fotos enviadas à OLX);
   - **E-mail (SMTP)**, para enviar contratos;
   - **FIPE API**: o token, se não usou a variável `FIPE_TOKEN`;
   - **OLX**: as chaves de integrador e **Conectar com a OLX**. O endereço de retorno aparece na própria tela.
3. Em **Usuários**, crie os logins da equipe.

## 5. Atualizar o sistema

Cada mudança mesclada no `main` publica uma imagem nova em alguns minutos (aba **Actions**). Para aplicar:
- **Stack por Repository:** abra a stack e clique em **Pull and redeploy**. Também dá para ligar **GitOps updates** para isso acontecer sozinho.
- **Stack por Web editor:** abra a stack, clique em **Update the stack** e marque **Re-pull image and redeploy**.

Os dados ficam no volume e não são afetados pela atualização.

Para voltar a uma versão anterior, troque `latest` por `sha-xxxxxxx` (as tags aparecem na página do pacote no GitHub).

## 6. Backup

Tudo está no volume `m2seminovos_data`: o `m2.db` e a pasta `uploads/`.

**Backup a quente** (com o sistema rodando), pelo console do servidor:
```bash
docker run --rm -v m2seminovos_data:/data -v "$PWD":/backup alpine \
  sh -c "apk add --no-cache sqlite >/dev/null && sqlite3 /data/m2.db '.backup /backup/m2-$(date +%F).db' && tar czf /backup/uploads-$(date +%F).tgz -C /data uploads"
```

**Restaurar:** pare a stack e copie os arquivos de volta para o volume:
```bash
docker run --rm -v m2seminovos_data:/data -v "$PWD":/backup alpine \
  sh -c "cp /backup/m2-AAAA-MM-DD.db /data/m2.db && rm -f /data/m2.db-wal /data/m2.db-shm && tar xzf /backup/uploads-AAAA-MM-DD.tgz -C /data && chown -R 1000:1000 /data"
```
Depois, suba a stack de novo.

Agende o backup (cron) e guarde as cópias fora do servidor.

## 7. Levar os dados do computador para o servidor (opcional)

Por padrão o servidor começa **zerado**, sem os dados de demonstração. Para levar o banco que você usou localmente:
1. Pare o sistema local e copie a pasta `data/` (o arquivo `m2.db` e a pasta `uploads/`).
2. No servidor, com a stack parada, restaure como no item 6.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Deploy falha com "Defina ADMIN_PASSWORD" | variável não preenchida | adicione `ADMIN_PASSWORD` em Environment variables |
| Erro `unauthorized` ou `denied` ao baixar a imagem | pacote privado no GitHub | deixe o pacote público (item 1) ou cadastre o registro com token |
| Container reiniciando com `SQLITE_CANTOPEN` ou `EACCES` | volume montado de uma pasta do host com outro dono | use o volume nomeado do compose, ou rode `chown -R 1000:1000` na pasta |
| Login não fica salvo | acesso por `http` atrás de proxy sem `X-Forwarded-Proto` | acesse por `https` pelo proxy; no NPM isso já vem configurado |
| Fotos não sobem | limite de upload do proxy | `client_max_body_size 50m;` no Advanced do NPM |
| Horários errados | fuso | o compose já define `TZ=America/Sao_Paulo`; confira se não foi removido |
