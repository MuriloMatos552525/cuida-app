# Cuida

App que conecta famílias a babás, pet sitters e cuidadores de idosos verificados.
Feito em **Expo** (React Native, roda em iPhone, Android e navegador) com **Firebase** no backend.
"Cuida" é um nome provisório.

## Rodar o app (modo demonstração)

Precisa do Node 22.

```bash
npm install
npx expo start
```

Abra no iPhone com o app **Expo Go** (leia o QR code) ou aperte `w` para abrir no navegador.
Sem configurar o Firebase, o app abre no **modo demonstração**: tela de login com os botões
"Sou cliente" e "Sou cuidadora", cuidadores de exemplo perto da Av. Paulista e uma simulação do
cuidador aceitando, indo e concluindo a reserva. Dá para testar o fluxo inteiro sozinho.

## Ligar ao Firebase

1. Crie um projeto no [Console do Firebase](https://console.firebase.google.com) no plano Blaze
   (as Cloud Functions exigem). Ative **Authentication > E-mail/senha** e crie o **Firestore** na
   região `southamerica-east1`.
2. Em Configurações do projeto, adicione um app Web e copie a configuração para `.env.local`
   (modelo em `.env.example`).
3. Publique backend e regras:

   ```bash
   cd functions
   npm install
   npx firebase login
   npx firebase use --add          # escolha o projeto
   npm run deploy                  # Cloud Functions, regras e índices do Firestore
   GCLOUD_PROJECT=seu-projeto node scripts/seed.js --reference   # tarifas, feriados, especialidades
   ```

   O seed usa as credenciais do `gcloud auth application-default login`.

4. Rode o app de novo (`npx expo start`). Ele passa a usar o Firebase.

Para desenvolver sem tocar no projeto real: `cd functions && npm run serve` sobe os emuladores,
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed` popula com dados de exemplo, e
`EXPO_PUBLIC_USE_EMULATORS=true` no `.env.local` aponta o app para eles.

## Como a segurança funciona

- **O app não grava nada sensível.** Reserva, preço, PIN, avaliação e verificação são gravados só
  pelas Cloud Functions. As regras do Firestore (`firestore.rules`) bloqueiam o resto e têm testes.
- **Cuidador só aparece na busca** com CPF, documento, selfie e antecedentes aprovados, certidão
  dentro da validade, aprovação da equipe e sem suspensão. Uma rotina diária vence certidões antigas.
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

- Envio de documentos e selfie para um provedor de verificação (idwall, unico, CAF) e aprovação pela equipe.
- Pagamento com divisão automática (Pagar.me, Mercado Pago ou Asaas) a partir da coleção `payments`.
- SMS aos contatos de emergência e notificações push.
- Login por telefone (exige build de desenvolvimento com `@react-native-firebase`).
- Definir tarifas reais, taxa da plataforma e cidade de lançamento.
