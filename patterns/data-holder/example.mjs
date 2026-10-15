import { DataHolder } from './DataHolder.mjs';

const holder = new DataHolder();

function show(label) {
  console.log(label, {
    state: holder.state,
    hasData: holder.hasData,
    data: holder.data,
    error: holder.error,
  });
}

show('Initial');
holder.startLoading();
show('First load');
holder.setData(0);
show('Zero is valid data');
holder.startLoading();
show('Refresh retains zero');
holder.setError('Refresh failed');
show('Error retains zero');
holder.setData(false);
show('Recovered with false');
holder.reset();
show('Reset');
