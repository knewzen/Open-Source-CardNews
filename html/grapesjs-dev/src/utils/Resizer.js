import {bindAll, defaults} from 'underscore';
import {on, off} from 'utils/mixins';

const $ = Backbone.$;

var defaultOpts = {
  // Function which returns custom X and Y coordinates of the mouse
  mousePosFetcher: null,
  // Indicates custom target updating strategy
  updateTarget: null,
  // Function which gets HTMLElement as an arg and returns it relative position
  ratioDefault: 0,
  posFetcher: null,
  onStart: null,
  onMove: null,
  onEnd: null,
  // Handlers
  tl: 1, // Top left
  tc: 1, // Top center
  tr: 1, // Top right
  cl: 1, // Center left
  cr: 1, // Center right
  bl: 1, // Bottom left
  bc: 1, // Bottom center
  br: 1, // Bottom right
};

var createHandler = (name, opts) => {
  var pfx = opts.prefix || '';
  var el = document.createElement('i');
  el.className = pfx + 'resizer-h ' + pfx + 'resizer-h-' + name;
  el.setAttribute('data-' + pfx + 'handler', name);
  return el;
};

var getBoundingRect = (el, win) => {
  var w = win || window;
  var rect = el.getBoundingClientRect();
  return {
    left: rect.left + w.pageXOffset,
    top: rect.top + w.pageYOffset,
    width: rect.width,
    height: rect.height
  };
};

class Resizer {

  /**
   * Init the Resizer with options
   * @param  {Object} options
   */
  constructor(opts = {}) {
    this.setOptions(opts);
    bindAll(this, 'handleKeyDown', 'handleMouseDown', 'move', 'stop')
    return this;
  }

  /**
   * Setup options
   * @param {Object} options
   */
  setOptions(options = {}) {
    this.opts = defaults(options, defaultOpts);
    this.setup();
  }

  /**
   * Setup resizer
   */
  setup() {
    const opts = this.opts;
    const pfx = opts.prefix || '';
    const appendTo = opts.appendTo || document.body;
    let container = this.container;

    // Create container if not yet exist
    if (!container) {
      container = document.createElement('div');
      container.className = `${pfx}resizer-c`;
      appendTo.appendChild(container);
      this.container = container;
    }

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Create handlers
    const handlers = {};
    ['tl', 'tc', 'tr', 'cl', 'cr', 'bl', 'bc', 'br'].forEach(hdl =>
      handlers[hdl] = opts[hdl] ? createHandler(hdl, opts) : '');

    for (let n in handlers) {
      const handler = handlers[n];
      handler && container.appendChild(handler);
    }

    this.handlers = handlers;
    this.mousePosFetcher = opts.mousePosFetcher;
    this.updateTarget = opts.updateTarget;
    this.posFetcher = opts.posFetcher;
    this.onStart = opts.onStart;
    this.onMove = opts.onMove;
    this.onEnd = opts.onEnd;
  }

  /**
   * Detects if the passed element is a resize handler
   * @param  {HTMLElement} el
   * @return {Boolean}
   */
  isHandler(el) {
    var handlers = this.handlers;

    for (var n in handlers) {
      if (handlers[n] === el) return true;
    }

    return false;
  }

  /**
   * Returns the focused element
   * @return {HTMLElement}
   */
  getFocusedEl() {
    return this.el;
  }

  /**
   * Returns documents
   */
  getDocumentEl() {
    return [this.el.ownerDocument, document];
  }

  /**
   * Return element position
   * @param  {HTMLElement} el
   * @return {Object}
   */
  getElementPos(el) {
    var posFetcher = this.posFetcher || '';
    return posFetcher ? posFetcher(el) : getBoundingRect(el);
  }

  /**
   * Focus resizer on the element, attaches handlers to it
   * @param {HTMLElement} el
   */
  focus(el) {
    // Avoid focusing on already focused element
    if (el && el === this.el) {
      return;
    }

    // Show the handlers
    this.el = el;
    var unit = 'px';
    var rect = this.getElementPos(el);
    var container = this.container;
    var contStyle = container.style;
    contStyle.left = rect.left + unit;
    contStyle.top = rect.top + unit;
    contStyle.width = rect.width + unit;
    contStyle.height = rect.height + unit;
    container.style.display = 'block';

    on(this.getDocumentEl(), 'mousedown', this.handleMouseDown);
  }

  /**
   * Blur from element
   */
  blur() {
    this.container.style.display = 'none';

    if (this.el) {
      off(this.getDocumentEl(), 'mousedown', this.handleMouseDown);
      this.el = null;
    }
  }

  /**
   * Start resizing
   * @param  {Event} e
   */
  start(e) {
    //Right or middel click
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var opts = this.opts || {};
    var attrName = 'data-' + opts.prefix + 'handler';
    var rect = this.getElementPos(this.el);
    this.handlerAttr = e.target.getAttribute(attrName);
    this.clickedHandler = e.target;
    this.startDim = {
      t: rect.top,
      l: rect.left,
      w: rect.width,
      h: rect.height,
    };
    this.rectDim = {
      t: rect.top,
      l: rect.left,
      w: rect.width,
      h: rect.height,
    };
    this.startPos = {
      x: e.clientX,
      y: e.clientY
    };

    // Listen events
    var doc = this.getDocumentEl();
    on(doc, 'mousemove', this.move);
    on(doc, 'keydown', this.handleKeyDown);
    on(doc, 'mouseup', this.stop);
    this.move(e);

    // Start callback
    if(typeof this.onStart === 'function') {
      this.onStart(e, {docs: doc});
    }
  }

  /**
   * While resizing
   * @param  {Event} e
   */
  move(e) {
    const onMove = this.onMove;
    var mouseFetch = this.mousePosFetcher;
    var currentPos = mouseFetch ? mouseFetch(e) : {
      x: e.clientX,
      y: e.clientY
    };

    this.currentPos = currentPos;
    this.delta = {
      x: currentPos.x - this.startPos.x,
      y: currentPos.y - this.startPos.y
    };
    this.keys = {
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey
    };

    this.rectDim = this.calc(this);
    this.updateRect(0);

    // Move callback
    onMove && onMove(e);

    // In case the mouse button was released outside of the window
    if (e.which === 0) {
      this.stop(e);
    }
  }

  /**
   * Stop resizing
   * @param  {Event} e
   */
  stop(e) {
    var doc = this.getDocumentEl();
    off(doc, 'mousemove', this.move);
    off(doc, 'keydown', this.handleKeyDown);
    off(doc, 'mouseup', this.stop);
    this.updateRect(1);

    // Stop callback
    if (typeof this.onEnd === 'function') {
      this.onEnd(e, {docs: doc});
    }
  }

  /**
   * Update rect
   */
  updateRect(store) {
    const el = this.el;
    const rect = this.rectDim;
    const conStyle = this.container.style;
    const updateTarget = this.updateTarget;
    const selectedHandler = this.getSelectedHandler();

    // Use custom updating strategy if requested
    if (typeof updateTarget === 'function') {
      updateTarget(el, rect, {
        store,
        selectedHandler
      });
    } else {
      const elStyle = el.style;
      elStyle.width = rect.w + 'px';
      elStyle.height = rect.h + 'px';
      //elStyle.top = rect.top + 'px';
      //elStyle.left = rect.left + 'px';
    }

    const unit = 'px';
    const rectEl = this.getElementPos(el);
    conStyle.left = rectEl.left + unit;
    conStyle.top = rectEl.top + unit;
    conStyle.width = rectEl.width + unit;
    conStyle.height = rectEl.height + unit;
  }

  /**
   * Get selected handler name
   * @return {string}
   */
  getSelectedHandler() {
    var handlers = this.handlers;

    if (!this.selectedHandler) {
      return;
    }

    for (let n in handlers) {
      if (handlers[n] === this.selectedHandler) return n;
    }
  }

  /**
   * Handle ESC key
   * @param  {Event} e
   */
  handleKeyDown(e) {
    if (e.keyCode === 27) {
      // Rollback to initial dimensions
      this.rectDim = this.startDim;
      this.stop(e);
    }
  }

  /**
   * Handle mousedown to check if it's possible to start resizing
   * @param  {Event} e
   */
  handleMouseDown(e) {
    var el = e.target;
    if (this.isHandler(el)) {
      this.selectedHandler = el;
      this.start(e);
    }else if(el !== this.el){
      this.selectedHandler = '';
      this.blur();
    }
  }

  /**
   * All positioning logic
   * @return {Object}
   */
  calc(data) {
    var opts = this.opts || {};
    var startDim = this.startDim;
    var box = {
      t: 0,
      l: 0,
      w: startDim.w,
      h: startDim.h
    };

    if (!data)
      return;

    var attr = data.handlerAttr;
    if (~attr.indexOf('r')) {
      box.w = Math.max(32, startDim.w + data.delta.x);
    }
    if (~attr.indexOf('b')) {
      box.h = Math.max(32, startDim.h + data.delta.y);
    }
    if (~attr.indexOf('l')) {
      box.w = Math.max(32, startDim.w - data.delta.x);
    }
    if (~attr.indexOf('t')) {
      box.h = Math.max(32, startDim.h - data.delta.y);
    }

    // Enforce aspect ratio (unless shift key is being held)
    var ratioActive = opts.ratioDefault ? !data.keys.shift : data.keys.shift;
    if (attr.indexOf('c') < 0 && ratioActive) {
      var ratio = startDim.w / startDim.h;
      if (box.w / box.h > ratio) {
        box.h = Math.round(box.w / ratio);
      } else {
        box.w = Math.round(box.h * ratio);
      }
    }

    if (~attr.indexOf('l')) {
      box.l = startDim.w - box.w;
    }
    if (~attr.indexOf('t')) {
      box.t = startDim.h - box.h;
    }

    return box;
  }
}

module.exports = {
  init(opts) {
    return new Resizer(opts);
  }
};
