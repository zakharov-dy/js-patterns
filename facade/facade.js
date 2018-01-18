// Пример Эдди Османи
const module = (function() {
  const _module = {
    i: 5,
    get: function() {
      console.log('Текущее значение:' + this.i);
    },
    set: function(val) {
      this.i = val;
    },
    run: function() {
      console.log('процесс запущен');
    },
    jump: function() {
      console.log('резкое изменение');
    }
  };
  return {
    facade: function(args) {
      _private.set(args.val);
      _private.get();
      if (args.run) {
        _private.run();
      }
    }
  }
}());

module.facade({run:true, val:10});