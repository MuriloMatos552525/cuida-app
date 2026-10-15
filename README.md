# Cuida

App que conecta famílias a babás, pet sitters e cuidadores de idosos verificados.
Feito em **Expo** (React Native, roda em iPhone, Android e navegador) com **Firebase** no backend.
"Cuida" é um nome provisório.

## Rodar o app

Precisa do Node 22.

```bash
npm install
npx expo start
```

Abra no iPhone com o app **Expo Go** (leia o QR code) ou aperte `w` para abrir no navegador.

O `npx expo start` roda em modo de desenvolvimento, que é bem mais lento que o app publicado. Para
sentir a velocidade real, use `npx expo start --no-dev --minify`.
O app já aponta para o projeto Firebase **cuida-cdd3d** (`src/lib/firebase-config.ts`).

Para testar sem servidor, crie `.env.local` com `EXPO_PUBLIC_DEMO=true`. O app abre no **modo
demonstração**, com os botões "Sou cliente" e "Sou cuidadora", cuidadores de exemplo perto da Av.
Paulista e uma simulação do cuidador aceitando, indo e concluindo a reserva.

## Publicar o backend

A lógica do servidor (reserva, preço, PIN, avaliação, verificação) fica em `functions/src` e pode rodar
de dois jeitos. Comece pelo plano grátis; quando for lançar, mude para o Blaze.

Nos dois casos, confira no [Console do Firebase](https://console.firebase.google.com/project/cuida-cdd3d)
se **Authentication > Método de login > E-mail/senha** está ativado.

### Plano grátis (Spark + Vercel)

O plano grátis do Firebase não roda Cloud Functions, então a mesma lógica roda como API na
[Vercel](https://vercel.com), que também é grátis. O banco e o login continuam no Firebase.

1. Publique as regras e os índices do Firestore (funciona no plano grátis e tira o banco do "modo de
   teste", que deixa qualquer pessoa ler e gravar):

   ```bash
   cd functions
   npm install
   npx firebase login
   npm run deploy:regras
   ```

2. No Console do Firebase, abra **Configurações do projeto > Contas de serviço** e clique em **Gerar
   nova chave privada**. Baixa um arquivo `.json`. Ele dá acesso total ao banco: não envie para o
   GitHub nem mande para ninguém.

3. Na Vercel, entre com sua conta do GitHub e clique em **Add New > Project**. Escolha o repositório
   `cuida-app` e preencha:
   - **Root Directory:** `functions`
   - **Framework Preset:** `Other`
   - **Environment Variables:**
     - `FIREBASE_SERVICE_ACCOUNT`: o conteúdo inteiro do arquivo `.json` do passo 2.
     - `CRON_SECRET`: uma senha longa qualquer, inventada por você.

   Clique em **Deploy**. No fim aparece o endereço da API, algo como `https://cuida-app-xxxx.vercel.app`.

4. Na pasta raiz do projeto, crie o arquivo `.env.local` com esse endereço e reinicie o `npx expo start`:

   ```bash
   EXPO_PUBLIC_API_URL=https://cuida-app-xxxx.vercel.app
   ```

Sem as Cloud Functions, não há gatilhos no banco. Uma rotina da Vercel roda todo dia às 3h e
recalcula quem aparece na busca (além de vencer certidões e liberar avaliações). Para aplicar na
hora uma aprovação feita no Console, rode, trocando a senha e o endereço:

```bash
curl -H "Authorization: Bearer SUA_SENHA" https://cuida-app-xxxx.vercel.app/api/manutencao
```

O plano grátis da Vercel (Hobby) é para uso não comercial e serve para testar. Para lançar, use o
Blaze abaixo (no começo o uso cabe na cota grátis) ou o plano pago da Vercel.

### Plano Blaze (Cloud Functions)

Mude o projeto para o plano **Blaze** no Console. Depois, dentro da pasta `functions`:

```bash
cd functions
npm install
npx firebase login
npm run deploy
```

Isso publica as Cloud Functions, as regras e os índices. Neste caso, deixe `EXPO_PUBLIC_API_URL` vazio.

### Tarifas e feriados

Gravar tarifas e feriados no banco é opcional: sem eles, o servidor usa as tarifas de exemplo de
`seedData.ts` para São Paulo e os feriados nacionais. Para gravar (usa as credenciais do
`gcloud auth application-default login`):

```bash
GCLOUD_PROJECT=cuida-cdd3d npm run seed -- --reference
```

O app (`npx expo start`) roda sempre na **pasta raiz** do projeto, nunca dentro de `functions`.
Um cuidador real só aparece na busca depois que a equipe aprova os documentos e libera o cuidador
na **Análise de documentos** (veja abaixo).

### Equipe que analisa documentos

CPF, documento, selfie e certidão de antecedentes são enviados pelo app (tela **Conta**, ou
**Perfil** do cuidador). As fotos ficam no Firestore em coleções que o app não consegue ler. Para
entrar na equipe:

1. Crie sua conta no app e copie o seu **User UID** em **Authentication > Users**, no Console do Firebase.
2. Em **Firestore Database**, crie a coleção `staff` com um documento cujo ID é esse UID (sem campos).
3. Feche e abra o app. Na tela **Conta** aparece o botão **Análise de documentos (equipe)**, com a fila
   de quem enviou documentos. Aprove ou reprove cada item (a pessoa vê o motivo) e, para cuidadores,
   toque em **Liberar cuidador** depois de conferir tudo.

Para desenvolver sem tocar no projeto real: `cd functions && npm run serve` sobe os emuladores,
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed` popula com dados de exemplo, e
`EXPO_PUBLIC_USE_EMULATORS=true` no `.env.local` aponta o app para eles.

## Como a segurança funciona

- **O app não grava nada sensível.** Reserva, preço, PIN, avaliação e verificação são gravados só
  pelas Cloud Functions. As regras do Firestore (`firestore.rules`) bloqueiam o resto e têm testes.
- **Cuidador só aparece na busca** com CPF, documento, selfie e antecedentes aprovados, certidão
  dentro da validade, aprovação da equipe e sem suspensão. Uma rotina diária vence certidões antigas.
- **Um CPF por conta:** quem for reprovado ou suspenso não volta com outra conta usando o mesmo CPF.
- **Endereço exato** do cliente só é liberado ao cuidador depois que ele aceita, e some quando o
  serviço termina. A localização do cuidador aparece arredondada (~1 km).
- **PIN de início:** o serviço só começa com o código de 4 dígitos que aparece no app do cliente.
- **Botão de emergência** durante o atendimento e avaliação **às cegas** (ninguém vê a nota do outro
  antes de dar a sua).

## Preço

O app sugere o valor e o servidor recalcula ao confirmar. Varia por hora ou diária, com mínimo de
horas, adicional noturno, de fim de semana ou de feriado (vale só o maior), adicional por
dependente e por especialidade, deslocamento até o endereço (ida e volta) e trajetos durante o
serviço, e desconto para pacotes longos. A taxa da plataforma sai do total. As tarifas ficam na
coleção `pricingRules` (uma por categoria e cidade); os valores de `seedData.ts` são **exemplos**.

## Estrutura

```
src/app/                 telas (Expo Router)
  entrar.tsx               login e cadastro
  cliente/                 início, reservas e conta do cliente
  pedido/, resultados.tsx, perfil/, confirmar.tsx   fluxo de reserva
  reserva/[id].tsx         acompanhamento, PIN, emergência e avaliação
  painel/                  pedidos e perfil do cuidador
src/lib/api/             Firebase (firebase.ts) e modo demonstração (demo.ts)
functions/src/shared/    preço, estados da reserva e elegibilidade (usados no app e no servidor)
functions/src/logic.ts   regras de negócio com o banco
functions/src/index.ts   Cloud Functions
firestore.rules          regras de acesso
```

## Testes

```bash
npx tsc --noEmit && npx expo lint && npx jest              # app
cd functions && npm test && npm run test:emulator          # backend (precisa de Java 21)
```

## Falta para lançar

- Conferência automática de CPF na Receita, comparação da selfie com o documento e busca de
  antecedentes por um provedor (idwall, unico, CAF). Hoje a equipe confere tudo a olho.
- Pagamento com divisão automática (Pagar.me, Mercado Pago ou Asaas) a partir da coleção `payments`.
- SMS aos contatos de emergência e notificações push.
- Login por telefone (exige build de desenvolvimento com `@react-native-firebase`).
- Definir tarifas reais, taxa da plataforma e cidade de lançamento.
