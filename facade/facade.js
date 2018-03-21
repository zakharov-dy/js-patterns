// Пример Эдди Османи
const myModule = (function () {
  const _private = {
    i: 5,
    get() {
      console.log(`Текущее значение:${this.i}`);
    },
    set(val) {
      this.i = val;
    },
    run() {
      console.log('процесс запущен');
    },
    jump() {
      console.log('резкое изменение');
    },
  };
  return {
    facade(args) {
      _private.set(args.val);
      _private.get();
      if (args.run) {
        _private.run();
      }
    },
  };
}());

myModule.facade({ run: true, val: 10 });
