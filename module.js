
try {
  // скобки вокруг обязательны - на месте можно вызывать только Function Expression
  // ; в начале ставится для того, чтобы исключить ошибку - возможно ; пропущены ранее
  (function () {
    const module = {};
    // Приватная переменная
    const protectionProperty = {};

    module.getProtectionProperty = function () {
      return protectionProperty;
    };

    // функция для вывода этой переменной
    if (window) {
      window.__pattern_module = module;
    } else throw new Error('window not found');
  }());
} catch (err) {
  console.log(err.toString());
  console.log('в ноде это норма');
}

// ещё вариант
const a = (function () {
  const module = {};
  // Приватная переменная
  const protectionProperty = {};

  module.getProtectionProperty = function () {
    return protectionProperty;
  };

  return module;
}());
console.log(a);
