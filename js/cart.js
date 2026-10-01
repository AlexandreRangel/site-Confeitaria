(function createCart(global) {
  const Jana = global.Jana;
  const STORAGE_KEY = "jana-abreu-cart-v1";

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  Jana.Cart = {
    items: function items() {
      return loadItems();
    },
    add: function add(product, quantity, options) {
      const qty = Math.max(1, Number(quantity) || 1);
      const flavor = options && options.flavor ? String(options.flavor) : "";
      const current = loadItems();
      const existing = current.find(function findItem(item) {
        return item.id === product.id && String(item.flavor || "") === flavor;
      });
      if (existing) {
        existing.quantity += qty;
      } else {
        current.push({
          id: product.id,
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
    setQty: function setQty(id, quantity) {
      const qty = Math.max(0, Number(quantity) || 0);
      const next = loadItems()
        .map(function update(item) {
          if (item.id !== id) {
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
    remove: function remove(id) {
      const next = loadItems().filter(function keep(item) {
        return item.id !== id;
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
