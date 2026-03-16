# Sistema de Controle de Veiculos

Sistema web responsivo para controle de utilizacao de veiculos com autenticacao por login e senha, autorizacao por perfil, fluxo seguro de retirada e devolucao, dashboard operacional e historico com auditoria.

## Conceito operacional

- `CHECK-IN`: quando o usuario retira o veiculo para uso
- `CHECK-OUT`: quando o usuario devolve o veiculo

O usuario logado e automaticamente tratado como motorista.

## Funcionalidades principais

- login com senha em hash
- perfis `admin` e `user`
- `CHECK-IN` para retirar veiculo
- `CHECK-OUT` para devolver veiculo
- proprietario do veiculo obrigatoriamente vinculado a um usuario do sistema
- usuario comum pode alterar a propria senha
- administrador pode gerenciar usuarios, veiculos e configuracoes
- administrador pode visualizar o log de acessos ao sistema
- observacoes do veiculo visiveis para todos
- `CHECK-OUT` automatico quando outro usuario nao proprietario retira um veiculo esquecido
- retorno automatico ao proprietario quando um nao proprietario devolve o veiculo
- historico com usuario, veiculo, proprietario, observacao, tipo de acao e indicador de automatico
- exclusao administrativa de registros fechados do historico

## Regras de proprietario

- cada veiculo precisa ter um `Proprietario do veiculo` selecionado na lista de usuarios
- o proprietario aparece nas telas de veiculo, retirada, devolucao e historico
- quando um nao proprietario retira o veiculo, o historico registra `CHECK-OUT automatico por uso do veiculo por outro usuario`
- quando um nao proprietario devolve o veiculo, o historico registra `Retorno automatico ao proprietario`
- se o proprietario estiver usando o proprio veiculo, o sistema nao encerra esse uso automaticamente

## Log de acessos

- toda tentativa de login com sucesso e registrada
- tentativas invalidas tambem ficam registradas como falha
- o administrador pode acessar a tela `Acessos ao sistema`
- a tela mostra:
  - usuario
  - perfil
  - data e hora do acesso
  - data e hora do logout, quando existir
  - status do acesso
  - IP e dispositivo/navegador, quando disponiveis

No dashboard do administrador tambem aparecem:

- ultimo usuario que logou
- quantidade de acessos no dia
- quantidade de falhas no dia

## Usuarios de teste

- administrador: `admin` / `admin123`
- usuario comum: `usuario` / `usuario123`
- usuario inativo: `inativo` / `inativo123`

## Como rodar localmente

### Backend

```bash
cd backend
npm install
npm run seed
npm run dev
```

API: `http://localhost:4000`

### Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`

## Importante apos esta atualizacao

Como a estrutura do banco foi ampliada para vincular o proprietario a um usuario do sistema, e recomendado recriar os dados locais:

```bash
cd backend
npm run seed
```

## Deploy gratuito no Render

O projeto foi preparado com [render.yaml](C:\Users\Felipe Coutinho\Desktop\controle de carro\render.yaml#L1) para facilitar o deploy.

### Estrutura recomendada

- `controle-veiculos-api`: web service Node no Render
- `controle-veiculos-web`: static site no Render

### Passos

1. Suba este projeto para um repositório GitHub.
2. No Render, escolha `New +` > `Blueprint`.
3. Conecte o repositório.
4. O Render vai ler [render.yaml](C:\Users\Felipe Coutinho\Desktop\controle de carro\render.yaml#L1).
5. Preencha as variaveis:
   - backend `ALLOWED_ORIGIN` = URL publica do frontend Render
   - frontend `VITE_API_URL` = `https://SUA-API.onrender.com/api`
6. Faça o deploy dos dois servicos.

### Variaveis de ambiente

Backend: [backend/.env.example](C:\Users\Felipe Coutinho\Desktop\controle de carro\backend\.env.example#L1)

Frontend: [frontend/.env.example](C:\Users\Felipe Coutinho\Desktop\controle de carro\frontend\.env.example#L1)

## Importante sobre o plano gratuito

- o Render Free pode hibernar servicos sem uso
- a primeira requisicao pode demorar
- este projeto continua usando SQLite
- no Render gratuito, o armazenamento local nao e garantido como persistente em cenarios de redeploy ou troca de instancia

Isso significa:

- para testes e uso leve, ele pode funcionar
- para uso continuo de empresa, o ideal depois e migrar para PostgreSQL

## Validacao recomendada

1. login com `admin`
2. retirar um veiculo em `CHECK-IN`
3. devolver o mesmo veiculo em `CHECK-OUT`
4. testar bloqueio de segundo veiculo para o mesmo usuario
5. testar `CHECK-OUT` automatico ao retirar veiculo em uso por outro usuario
6. entrar com `usuario` e alterar a propria senha em `Minha conta`
7. testar retirada de veiculo de outro usuario e conferir `Retorno automatico ao proprietario` no historico
8. testar exclusao de um registro fechado do historico com `admin`
9. abrir `Acessos ao sistema` como `admin` e conferir logins com sucesso e falha
