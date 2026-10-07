# CuidaApp

App para iPhone que conecta famílias a babás, pet sitters e cuidadores de idosos verificados.
"CuidaApp" é um nome provisório.

A arquitetura completa (stack, segurança, telas, preço e roadmap) está no documento
[Arquitetura do app de cuidadores](https://claude.ai/code/artifact/401cefd1-331b-412f-927c-17fca7a1f266).

## Rodar no simulador (sem backend)

Precisa de um Mac com Xcode 16 ou mais novo.

```bash
brew install xcodegen
xcodegen generate
open CuidaApp.xcodeproj
```

Escolha um iPhone no simulador e aperte ▶︎. Sem configuração, o app abre no **modo de exemplo**:
dados fictícios, qualquer telefone e código de 6 dígitos funcionam, e a tela da reserva tem botões
para simular o cuidador (aceitar, iniciar, encerrar). Assim dá para testar o fluxo inteiro sozinho.

## Ligar ao Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) e ative o login por telefone (Authentication > Providers > Phone, com um provedor de SMS).
2. Aplique o banco: `supabase link --project-ref SEU-PROJETO` e depois `supabase db push`. Rode o `supabase/seed.sql` no SQL Editor.
3. Crie `Config/Secrets.xcconfig` (ele fica fora do git):

   ```
   SUPABASE_URL = https:/$()/SEU-PROJETO.supabase.co
   SUPABASE_ANON_KEY = sua-chave-anon
   ```

4. Rode `xcodegen generate` de novo e abra o app.

## Estrutura

```
App/                         ponto de entrada; escolhe Supabase ou modo de exemplo
Packages/CuidaKit/
  Sources/Core/              modelos, cálculo de preço, estados da reserva, dados de exemplo
  Sources/DesignSystem/      cores, botões, selos, cartões
  Sources/SupabaseData/      acesso ao Supabase
  Sources/Features/          telas do cliente e do cuidador
  Tests/CoreTests/           testes do preço e dos estados da reserva
supabase/
  migrations/                tabelas, regras de acesso (RLS) e funções
  seed.sql                   especialidades, tarifas de exemplo e feriados
  tests/                     testes SQL do preço, do fluxo de reserva e dos acessos
```

## Regras importantes

- **O preço que vale é o do servidor.** `quote_price` (SQL) e `PricingEngine` (Swift) fazem o mesmo cálculo;
  o app só mostra a estimativa. Ao mudar um, mude o outro e os testes dos dois (os casos são os mesmos).
- **O app nunca grava status, preço ou verificação direto.** Tudo passa pelas funções do banco
  (`create_booking`, `booking_transition`, `submit_review`), que validam quem está chamando.
- **Cuidador só aparece na busca** com CPF, documento, selfie e antecedentes aprovados, antecedentes dentro
  da validade e aprovação da equipe (`is_caregiver_eligible`).
- **O PIN de início só chega ao cliente**, e o endereço exato só chega ao cuidador depois do aceite.
- As tarifas do `seed.sql` são exemplos; as reais ainda precisam ser definidas.

## Testes

- Núcleo Swift: `cd Packages/CuidaKit && xcodebuild test -scheme CuidaKit-Package -destination 'platform=iOS Simulator,name=iPhone 16'`
- Banco: o CI sobe um Postgres com PostGIS e roda `supabase/tests/*.sql` (veja `.github/workflows/ci.yml`).

## Próximos passos

- Fluxo de verificação com o provedor de KYC (CPF, selfie, antecedentes) e webhook de retorno.
- Pagamento com o gateway escolhido (Edge Function para autorizar, capturar e repassar).
- Cadastro de endereço com busca no mapa e cadastro completo do cuidador (categorias, raio, agenda).
- Chat em tempo real, notificações push e Live Activity do serviço em andamento.
- Painel interno para aprovar cuidadores e moderar denúncias.
