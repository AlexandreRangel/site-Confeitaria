(function sheetsStub(global) {
  const Jana = global.Jana || {};

  /**
   * TODO: futura sincronização com Google Sheets.
   * NÃO chamar APIs do Google nesta versão (sem gapi, sem service account, sem Apps Script).
   *
   * Quando for implementar de verdade:
   * 1. Criar planilha com aba Clientes (nome | email | telefone) e aba Pedidos.
   * 2. Usar Apps Script / webhook no servidor — nunca expor chave no front do Pages.
   * 3. Mapear o CSV de clientes (nome,email,telefone) para as colunas da aba.
   * 4. Preferir exportar CSV daqui e colar na planilha até o sync automático existir.
   */
  Jana.Sheets = {
    enabled: false,
    syncClients: function syncClients() {
      // TODO: Google Sheets sync — disabled on purpose.
      console.info("Sheets stub: syncClients() não está ligado. Use o CSV.");
      return Promise.resolve({ ok: false, reason: "not-implemented" });
    },
    syncOrders: function syncOrders() {
      // TODO: Google Sheets sync — disabled on purpose.
      console.info("Sheets stub: syncOrders() não está ligado. Baixe o JSON.");
      return Promise.resolve({ ok: false, reason: "not-implemented" });
    },
  };

  global.Jana = Jana;
})(window);
