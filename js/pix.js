(function createPix(global) {
  const Jana = global.Jana || {};

  function pad2(value) {
    const n = Number(value);
    return (n < 10 ? "0" : "") + String(n);
  }

  Jana.pixTlv = function pixTlv(id, value) {
    const str = String(value == null ? "" : value);
    return id + pad2(str.length) + str;
  };

  Jana.crc16ccitt = function crc16ccitt(text) {
    let crc = 0xffff;
    const source = String(text || "");
    for (let i = 0; i < source.length; i++) {
      crc ^= source.charCodeAt(i) << 8;
      for (let bit = 0; bit < 8; bit++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    const hex = crc.toString(16).toUpperCase();
    return ("0000" + hex).slice(-4);
  };

  Jana.stripPixText = function stripPixText(text, max) {
    const limit = Number(max) || 0;
    const raw = String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    return limit ? raw.slice(0, limit) : raw;
  };

  Jana.sanitizePixTxid = function sanitizePixTxid(txid) {
    const clean = String(txid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
    return clean || "***";
  };

  Jana.formatPixAmount = function formatPixAmount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      return "0.00";
    }
    return n.toFixed(2);
  };

  Jana.pixConfig = function pixConfig(pix) {
    const raw = pix || {};
    return {
      enabled: raw.enabled === true,
      chave: String(raw.chave || "").trim(),
      nome: String(raw.nome || "").trim(),
      cidade: String(raw.cidade || "").trim(),
    };
  };

  Jana.pixIsReady = function pixIsReady(pix) {
    const cfg = Jana.pixConfig(pix);
    return !!(cfg.enabled && cfg.chave && cfg.nome && cfg.cidade);
  };

  Jana.buildPixPayload = function buildPixPayload(opts) {
    const options = opts || {};
    const chave = String(options.chave || "").trim();
    const nome = Jana.stripPixText(options.nome, 25);
    const cidade = Jana.stripPixText(options.cidade, 15);
    const txid = Jana.sanitizePixTxid(options.txid);
    if (!chave || !nome || !cidade) {
      return "";
    }
    const merchant = Jana.pixTlv("00", "br.gov.bcb.pix") + Jana.pixTlv("01", chave);
    let body =
      Jana.pixTlv("00", "01") +
      Jana.pixTlv("26", merchant) +
      Jana.pixTlv("52", "0000") +
      Jana.pixTlv("53", "986");
    if (options.valor != null && options.valor !== "") {
      body += Jana.pixTlv("54", Jana.formatPixAmount(options.valor));
    }
    body +=
      Jana.pixTlv("58", "BR") +
      Jana.pixTlv("59", nome) +
      Jana.pixTlv("60", cidade) +
      Jana.pixTlv("62", Jana.pixTlv("05", txid)) +
      "6304";
    return body + Jana.crc16ccitt(body);
  };

  global.Jana = Jana;
})(window);
