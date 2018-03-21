function Singleton() {
  if (typeof Singleton.instance === 'object') {
    return Singleton.instance;
  }
  Singleton.instance = this;
}
const o1 = new Singleton();
const o2 = new Singleton();
console.log(o1 === o2); // true

Singleton.prototype.date = Date.now();
console.log(o1.date); // date
