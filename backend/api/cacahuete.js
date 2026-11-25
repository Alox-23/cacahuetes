import { createHandler } from '../lib/handler.js';

const handle = createHandler();

export default {
  fetch(request) {
    return handle(request);
  }
};
