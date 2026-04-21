(function (global) {
  function createEventBus() {
    var handlers = {};

    function on(eventName, handler) {
      if (!handlers[eventName]) {
        handlers[eventName] = [];
      }

      handlers[eventName].push(handler);

      return function off() {
        handlers[eventName] = (handlers[eventName] || []).filter(function (entry) {
          return entry !== handler;
        });
      };
    }

    function emit(eventName, payload) {
      (handlers[eventName] || []).slice().forEach(function (handler) {
        handler(payload);
      });
    }

    return {
      on: on,
      emit: emit
    };
  }

  global.SpreadsheetEvents = {
    createEventBus: createEventBus
  };
}(window));
