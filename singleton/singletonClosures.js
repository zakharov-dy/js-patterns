function Singleton() {
  const instance = this;
  Singleton = function () {
    return instance;
  };
}

const o1 = new Singleton();
const o2 = new Singleton();
console.log(o1 === o2); // true

Singleton.prototype.date = Date.now();
console.log(o1.date); // undefined

function Singleton2() {
  const instance = this;
  Singleton2 = function () {
    return instance;
  };
  Singleton2.prototype = instance.constructor.prototype;
}

const o3 = new Singleton2();
const o4 = new Singleton2();
console.log(o3 === o4); // true

Singleton2.prototype.date = Date.now();
console.log(o3.date); // date
