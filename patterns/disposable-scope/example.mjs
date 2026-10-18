import { EventEmitter } from 'node:events';
import { DisposableScope } from './disposable-scope.mjs';

const events = new EventEmitter();
const scope = new DisposableScope();
const listener = (message) => console.log(message);

events.on('message', listener);
scope.add(() => events.off('message', listener));

const subscription = {
  active: true,
  unsubscribe() {
    this.active = false;
    console.log('Subscription released');
  },
};
scope.addSubscription(subscription, 'unsubscribe');

try {
  events.emit('message', 'Scope is active');
} finally {
  scope.dispose();
}

events.emit('message', 'This listener has been removed');
console.log(`Scope disposed: ${scope.disposed}`);
console.log(`Subscription active: ${subscription.active}`);
