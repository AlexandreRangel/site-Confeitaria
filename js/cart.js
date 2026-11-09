(function createCart(global) {
  const Jana = global.Jana;
  const STORAGE_KEY = "jana-abreu-cart-v1";
  let memoryItems = null;
  let storageFailed = false;

  function lineIdOf(item) {
    if (item && item.lineId) {
      return String(item.lineId);
    }
    return String((item && item.id) || "") + "::" + String((item && item.flavor) || "");
  }

  function withLineId(item) {
    if (!item || item.lineId) {
      return item;
    }
    return Object.assign({}, item, { lineId: lineIdOf(item) });
  }

  function loadItems() {
    if (memoryItems) {
      return memoryItems.map(withLineId);
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = (Array.isArray(parsed) ? parsed : []).map(withLineId);
      if (storageFailed) {
        memoryItems = list;
      }
      return list;
    } catch (err) {
      return [];
    }
  }

  function saveItems(items) {
    const next = (items || []).map(withLineId);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      memoryItems = null;
      storageFailed = false;
    } catch (err) {
      memoryItems = next;
      storageFailed = true;
    }
    return next;
  }

  Jana.Cart = {
    lineIdOf: lineIdOf,
    storageFailed: function isStorageFailed() {
      return storageFailed;
    },
    items: function items() {
      return loadItems();
    },
    add: function add(product, quantity, options) {
      const qty = Math.max(1, Number(quantity) || 1);
      const flavor = options && options.flavor ? String(options.flavor) : "";
      const lineId = String(product.id) + "::" + flavor;
      const current = loadItems();
      const existing = current.find(function findItem(item) {
        return lineIdOf(item) === lineId;
      });
      if (existing) {
        existing.quantity += qty;
        existing.lineId = lineId;
      } else {
        current.push({
          id: product.id,
          lineId: lineId,
          slug: product.slug,
          name: product.name,
          price: product.price,
          image: product.images[0],
          quantity: qty,
          flavor: flavor,
        });
      }
      saveItems(current);
      return current;
    },
    setQty: function setQty(lineId, quantity) {
      const qty = Math.max(0, Number(quantity) || 0);
      const key = String(lineId || "");
      const next = loadItems()
        .map(function update(item) {
          if (lineIdOf(item) !== key) {
            return item;
          }
          return Object.assign({}, item, { quantity: qty });
        })
        .filter(function keep(item) {
          return item.quantity > 0;
        });
      saveItems(next);
      return next;
    },
    remove: function remove(lineId) {
      const key = String(lineId || "");
      const next = loadItems().filter(function keep(item) {
        return lineIdOf(item) !== key;
      });
      saveItems(next);
      return next;
    },
    clear: function clear() {
      saveItems([]);
    },
    count: function count() {
      return loadItems().reduce(function sum(total, item) {
        return total + item.quantity;
      }, 0);
    },
    total: function total() {
      return loadItems().reduce(function sum(value, item) {
        return value + item.price * item.quantity;
      }, 0);
    },
  };
})(window);
