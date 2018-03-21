// родительский конструктор
function Computer() {}
// методы прототипа - общий код для всех конструкторов
Computer.prototype.run = function () {
  setTimeout(() => {
    console.log(`${this.constructor.name} включился за ${this.startTime} мс`);
    this.on = true;
  }, this.startTime);
};
// статический фабричный метод
Computer.factory = function (type) {
  const Constructor = Computer[type];
  if (Constructor.prototype.__proto__ !== Computer.prototype) {
    Constructor.prototype.__proto__ = Computer.prototype;
  }
  return new Constructor();
};

// специализированные конструкторы
Computer.Tablet = function Tablet() {
  this.startTime = 1000;
};

Computer.PC = function PC() {
  this.startTime = 2000;
};

const tablet = Computer.factory('Tablet');
const pc = Computer.factory('PC');
tablet.run();
pc.run();
