self.onmessage = (event) => {
  const { type } = event.data || {};

  if (type === 'prune') {
    self.postMessage({ type: 'prune-request' });
  }

  if (type === 'usage') {
    self.postMessage({ type: 'usage-result', bytes: 0 });
  }
};

