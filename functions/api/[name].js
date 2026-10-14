// Função da Vercel: /api/<operação>. O código fica em src/http.ts (compilado em lib/ no build).
module.exports = (req, res) => require('../lib/vercel').vercelHandler(req, res);
