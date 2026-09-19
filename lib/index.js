// src/host/index.ts
import { readFile as readFile2 } from "node:fs/promises";
import Schema from "@deepseek-ai/schemastery";

// src/host/domain.ts
import { z as z3 } from "zod";

// node_modules/@deepseek-ai/dsh-storage-domain/lib/index.js
import z from "@deepseek-ai/schemastery";

// node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function defineProperty(object, key, value) {
  return Object.defineProperty(object, key, {
    writable: true,
    value,
    enumerable: false
  });
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function tokenize(source, delimiters, delimiter) {
  const output = [];
  let state = 0;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      if (state === 1) {
        const next = source.charCodeAt(i + 1);
        if (next >= 97 && next <= 122) output.push(delimiter);
        output.push(code + 32);
      } else {
        if (state !== 0) output.push(delimiter);
        output.push(code + 32);
      }
      state = 1;
    } else if (code >= 97 && code <= 122) {
      output.push(code);
      state = 2;
    } else if (delimiters.includes(code)) {
      if (state !== 0) output.push(delimiter);
      state = 0;
    } else output.push(code);
  }
  return String.fromCharCode(...output);
}
function paramCase(source) {
  return tokenize(source, [45, 95], 45);
}
var hyphenate = paramCase;
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
    if (typeof date === "number") date = new Date(date);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date) {
    const parsed = parseTime(date);
    if (parsed) date = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
    return date ? new Date(date) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/@deepseek-ai/cordis/lib/index.js
var DisposableList = class {
  sn = 0;
  map = /* @__PURE__ */ new Map();
  weak = /* @__PURE__ */ new WeakMap();
  get length() {
    return this.map.size;
  }
  push(value) {
    const sn = ++this.sn;
    this.map.set(sn, value);
    this.weak.set(value, sn);
    return () => this.map.delete(sn);
  }
  delete(value) {
    const sn = this.weak.get(value);
    if (!sn) return false;
    return this.map.delete(sn);
  }
  clear() {
    const values = [...this.map.values()];
    this.map.clear();
    return values.reverse();
  }
  [Symbol.iterator]() {
    return this.map.values();
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return [...this];
  }
};
var symbols = {
  shadow: Symbol.for("cordis.shadow"),
  receiver: Symbol.for("cordis.receiver"),
  original: Symbol.for("cordis.original"),
  metadata: Symbol.for("cordis.metadata"),
  initHooks: Symbol.for("cordis.initHooks"),
  checkProto: Symbol.for("cordis.checkProto"),
  effect: Symbol.for("cordis.effect"),
  filter: Symbol.for("cordis.filter"),
  isolate: Symbol.for("cordis.isolate"),
  intercept: Symbol.for("cordis.intercept"),
  init: Symbol.for("cordis.init"),
  check: Symbol.for("cordis.check"),
  config: Symbol.for("cordis.config"),
  invoke: Symbol.for("cordis.invoke"),
  extend: Symbol.for("cordis.extend"),
  tracker: Symbol.for("cordis.tracker"),
  resolveConfig: Symbol.for("cordis.resolveConfig")
};
var GeneratorFunction = function* () {
}.constructor;
var AsyncGeneratorFunction = async function* () {
}.constructor;
function isConstructor(func) {
  if (!func.prototype) return false;
  if (func instanceof GeneratorFunction) return false;
  if (AsyncGeneratorFunction !== Function && func instanceof AsyncGeneratorFunction) return false;
  return true;
}
function joinPrototype(proto1, proto2) {
  if (proto1 === Object.prototype) return proto2;
  const result = Object.create(joinPrototype(Object.getPrototypeOf(proto1), proto2));
  for (const key of Reflect.ownKeys(proto1)) Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(proto1, key));
  return result;
}
function isObject(value) {
  return value && (typeof value === "object" || typeof value === "function");
}
function getPropertyDescriptor(target, prop) {
  let proto = target;
  while (proto) {
    const desc = Reflect.getOwnPropertyDescriptor(proto, prop);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
}
function getTraceable(ctx, value) {
  if (!isObject(value)) return value;
  if (Object.hasOwn(value, symbols.shadow)) return Object.getPrototypeOf(value);
  const tracker = value[symbols.tracker];
  if (!tracker) return value;
  return createTraceable(ctx, value, tracker);
}
function withProps(target, props) {
  if (!props) return target;
  return new Proxy(target, {
    get: (target2, prop, receiver) => {
      if (prop in props && prop !== "constructor") return Reflect.get(props, prop, receiver);
      return Reflect.get(target2, prop, receiver);
    },
    set: (target2, prop, value, receiver) => {
      if (prop in props && prop !== "constructor") return Reflect.set(props, prop, value, receiver);
      return Reflect.set(target2, prop, value, receiver);
    }
  });
}
function withProp(target, prop, value) {
  return withProps(target, Object.defineProperty(/* @__PURE__ */ Object.create(null), prop, {
    value,
    writable: false
  }));
}
function createShadow(ctx, target, property, receiver) {
  if (!property) return receiver;
  const origin = Reflect.getOwnPropertyDescriptor(target, property)?.value;
  if (!origin) return receiver;
  return withProp(receiver, property, ctx.extend({ [symbols.shadow]: origin }));
}
function createShadowMethod(ctx, value, outer, shadow) {
  return new Proxy(value, { apply: (target, thisArg, args) => {
    if (thisArg === outer) thisArg = shadow;
    return getTraceable(ctx, Reflect.apply(target, thisArg, args));
  } });
}
function createTraceable(ctx, value, tracker) {
  if (ctx[symbols.shadow] && !tracker.noShadow) ctx = Object.getPrototypeOf(ctx);
  const proxy = new Proxy(value, {
    get: (target, prop, receiver) => {
      if (prop === symbols.original) return target;
      if (prop === tracker.property) return ctx;
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (tracker.associate && ctx.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.get(ctx, `${tracker.associate}.${prop}`, withProp(ctx, symbols.receiver, receiver));
      let shadow, innerValue;
      const desc = getPropertyDescriptor(target, prop);
      if (desc && "value" in desc) innerValue = desc.value;
      else {
        shadow = createShadow(ctx, target, tracker.property, receiver);
        innerValue = Reflect.get(target, prop, shadow);
      }
      const innerTracker = innerValue?.[symbols.tracker];
      if (innerTracker) return createTraceable(ctx, innerValue, innerTracker);
      else if (!tracker.noShadow && typeof innerValue === "function") {
        shadow ??= createShadow(ctx, target, tracker.property, receiver);
        return createShadowMethod(ctx, innerValue, receiver, shadow);
      } else return innerValue;
    },
    set: (target, prop, value2, receiver) => {
      if (prop === symbols.original) return false;
      if (prop === tracker.property) return false;
      if (typeof prop === "symbol") return Reflect.set(target, prop, value2, receiver);
      if (tracker.associate && ctx.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.set(ctx, `${tracker.associate}.${prop}`, value2, withProp(ctx, symbols.receiver, receiver));
      const shadow = createShadow(ctx, target, tracker.property, receiver);
      return Reflect.set(target, prop, value2, shadow);
    },
    apply: (target, thisArg, args) => {
      return applyTraceable(proxy, target, thisArg, args);
    }
  });
  return proxy;
}
function applyTraceable(proxy, value, thisArg, args) {
  if (!value[symbols.invoke]) return Reflect.apply(value, thisArg, args);
  return value[symbols.invoke].apply(proxy, args);
}
function createCallable(name2, proto, tracker) {
  const self = function(...args) {
    return applyTraceable(createTraceable(self["ctx"], self, tracker), self, this, args);
  };
  defineProperty(self, "name", name2);
  return Object.setPrototypeOf(self, proto);
}
function handleError(info, reason, getOuterStack) {
  const innerLines = info.error.stack.split("\n");
  if (typeof reason?.stack !== "string") {
    const outerError = new Error(reason);
    const lines2 = outerError.stack.split("\n");
    lines2.splice(1, Infinity, ...getOuterStack());
    outerError.stack = lines2.join("\n");
    throw outerError;
  }
  const lines = reason.stack.split("\n");
  let index = lines.indexOf(innerLines[2]);
  if (index === -1) throw reason;
  index -= info.offset;
  while (index > 0) {
    if (!lines[index - 1].endsWith(" (<anonymous>)")) break;
    index -= 1;
  }
  lines.splice(index, Infinity, ...getOuterStack());
  reason.stack = lines.join("\n");
  throw reason;
}
function composeError(callback, getOuterStack = buildOuterStack()) {
  const info = {
    offset: 1,
    error: /* @__PURE__ */ new Error()
  };
  try {
    const result = callback(info);
    if (isObject(result) && "then" in result) return result.then(void 0, (reason) => handleError(info, reason, getOuterStack));
    else return result;
  } catch (reason) {
    handleError(info, reason, getOuterStack);
  }
}
function buildOuterStack(offset = 0) {
  const outerError = /* @__PURE__ */ new Error();
  return () => outerError.stack.split("\n").slice(3 + offset);
}
function isBailed(value) {
  return value !== null && value !== false && value !== void 0;
}
var EventsService = class {
  ctx;
  _hooks = {};
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
    this.on("internal/listener", function(name2, listener, options) {
      if (name2 === "internal/update" && !options.global) return (this.fiber._hooks["internal/update"] ??= new DisposableList())[options.prepend ? "unshift" : "push"](listener);
    });
    this.on("internal/update", function(config, noSave, next) {
      const cbs = [...this._hooks["internal/update"] || []];
      const _next = () => {
        return (cbs.shift() ?? next).call(this, config, noSave, _next);
      };
      return _next();
    }, {
      global: true,
      prepend: true
    });
  }
  /**
  * Resolve listeners for one dispatch and apply context filtering.
  *
  * @param type — the dispatch mode, reported on `internal/dispatch`.
  * @param args — the raw dispatch arguments; consumed up to the event name.
  * @returns the matching listener callbacks, bound to the dispatch `this`.
  */
  dispatch(type, args) {
    const thisArg = typeof args[0] === "object" || typeof args[0] === "function" ? args.shift() : null;
    const name2 = args.shift();
    if (!name2.startsWith("internal/")) this.emit("internal/dispatch", type, name2, args, thisArg);
    const filter = thisArg?.[Context.filter];
    return (this._hooks[name2] || []).filter((hook) => hook.global || !filter || filter.call(thisArg, hook.ctx)).map((hook) => hook.callback.bind(thisArg));
  }
  /**
  * Run listeners concurrently and wait for all of them.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns a promise resolving once every listener has settled.
  */
  async parallel(...args) {
    const errors = (await Promise.allSettled(this.dispatch("emit", args).map(async (cb) => cb(...args)))).filter((result) => result.status === "rejected");
    if (errors.length) throw new AggregateError(errors.map((error) => error.reason));
  }
  /**
  * Run listeners synchronously without waiting for returned promises.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  */
  emit(...args) {
    this.dispatch("emit", args).map((cb) => cb(...args));
  }
  /**
  * Run listeners in order, awaiting each, until one returns a bail value.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns the first bail value (see {@link isBailed}), if any.
  */
  async serial(...args) {
    for (const cb of this.dispatch("serial", args)) {
      const result = await cb(...args);
      if (isBailed(result)) return result;
    }
  }
  /**
  * Run listeners synchronously until one returns a bail value.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns the first bail value (see {@link isBailed}), if any.
  */
  bail(...args) {
    for (const cb of this.dispatch("bail", args)) {
      const result = cb(...args);
      if (isBailed(result)) return result;
    }
  }
  /**
  * Compose listeners around the final `next` callback.
  *
  * The last dispatch argument is treated as the innermost `next`. Listeners
  * run outermost-first; a listener that does not call `next()` vetoes the
  * rest of the chain, including the built-in behavior.
  *
  * @param args — optional `this`, the event name, listener arguments, then `next`.
  * @returns the outermost listener's return value.
  */
  waterfall(...args) {
    const cbs = this.dispatch("waterfall", args);
    const inner = args.pop();
    const next = () => {
      return (cbs.shift() ?? inner)(...args);
    };
    args.push(next);
    return next();
  }
  /**
  * Store a listener record as an effect on the current fiber.
  *
  * @param label — effect label shown in fiber diagnostics.
  * @param hooks — the listener list for one event.
  * @param callback — the listener to store.
  * @param options — placement and filtering options.
  * @returns a disposer that unregisters the listener.
  */
  register(label, hooks, callback, options) {
    const method = options.prepend ? "unshift" : "push";
    return this.ctx.fiber.effect(() => {
      hooks[method]({
        ctx: this.ctx,
        callback,
        ...options
      });
      return () => this.unregister(hooks, callback);
    }, label);
  }
  /**
  * Remove a stored listener record.
  *
  * @param hooks — the listener list for one event.
  * @param callback — the listener to remove.
  * @returns `true` if the listener was found and removed.
  */
  unregister(hooks, callback) {
    const index = hooks.findIndex((hook) => hook.callback === callback);
    if (index >= 0) {
      hooks.splice(index, 1);
      return true;
    }
  }
  /**
  * Register an event listener owned by the current fiber.
  *
  * The listener is removed automatically when the fiber unloads. Throws
  * `CordisError('INACTIVE_EFFECT')` if the fiber is already disposed.
  *
  * @param name — the event name to listen for.
  * @param listener — called with the dispatch arguments.
  * @param options — listener options; a boolean is shorthand for `prepend`.
  * @returns a disposer removing the listener; `true` if it was still registered.
  */
  on(name2, listener, options) {
    if (typeof options !== "object") options = { prepend: options };
    this.ctx.fiber.assertActive();
    listener = this.ctx.reflect.bind(listener);
    const result = this.bail(this.ctx, "internal/listener", name2, listener, options);
    if (result) return result;
    const hooks = this._hooks[name2] ||= [];
    const label = `ctx.on(${typeof name2 === "string" ? JSON.stringify(name2) : name2.toString()})`;
    return this.register(label, hooks, listener, options);
  }
  /**
  * Register an event listener that disposes itself after the first call.
  *
  * @param name — the event name to listen for.
  * @param listener — called at most once with the dispatch arguments.
  * @param options — listener options; a boolean is shorthand for `prepend`.
  * @returns a disposer removing the listener; `true` if it was still registered.
  */
  once(name2, listener, options) {
    const dispose = this.on(name2, function(...args) {
      dispose();
      return listener.apply(this, args);
    }, options);
    return dispose;
  }
};
var defaultFormatters = {
  s: (value) => String(value),
  d: (value) => Math.trunc(Number(value)),
  i: (value) => Math.trunc(Number(value)),
  f: (value) => Number(value),
  o: (value) => JSON.stringify(value),
  O: (value) => JSON.stringify(value),
  c: () => "",
  C: (value, exporter, message) => {
    return Logger.color(exporter, Logger.code(message.name, exporter.colors), value);
  }
};
function isAggregateError(error) {
  return error instanceof Error && Array.isArray(error["errors"]);
}
var Logger = class {
  service;
  static color(exporter, code, value, decoration = "") {
    if (!exporter.colors) return "" + value;
    return `\x1B[3${code < 8 ? code : "8;5;" + code}${exporter.colors >= 2 ? decoration : ""}m${value}\x1B[0m`;
  }
  static code(name2, level) {
    let hash = 0;
    for (let i = 0; i < name2.length; i++) {
      hash = (hash << 3) - hash + name2.charCodeAt(i) + 13;
      hash |= 0;
    }
    const colors = !level ? [] : level >= 2 ? c256 : c16;
    return colors[Math.abs(hash) % colors.length];
  }
  static format(exporter, message) {
    const args = message.args.slice();
    if (args[0] instanceof Error) {
      args[0] = args[0].stack || args[0].message;
      args.unshift("%s");
    } else if (typeof args[0] !== "string") args.unshift("%o");
    let format = args.shift();
    format = format.replace(/%([a-zA-Z%])/g, (match, char) => {
      if (match === "%%") return "%";
      const formatter = exporter.formatters?.[char] ?? defaultFormatters[char];
      if (typeof formatter === "function") return formatter(args.shift(), exporter, message);
      return match;
    });
    const oFormatter = exporter.formatters?.o ?? defaultFormatters.o;
    for (let arg of args) {
      if (typeof arg === "object" && arg) arg = oFormatter(arg, exporter, message);
      format += " " + arg;
    }
    const { maxLength = 10240 } = exporter;
    return format.split(/\r?\n/g).map((line) => {
      return line.slice(0, maxLength) + (line.length > maxLength ? "..." : "");
    }).join("\n");
  }
  constructor(options, service) {
    this.service = service;
    Object.assign(this, options);
    this.error = this._method("error", 0);
    this.info = this._method("info", 1);
    this.warn = this._method("warn", 2);
    this.debug = this._method("debug", 3);
  }
  _method(type, level) {
    return (...args) => {
      if (args.length === 1 && args[0] instanceof Error) {
        if (args[0].cause) this[type](args[0].cause);
        else if (isAggregateError(args[0])) {
          args[0].errors.forEach((error) => this[type](error));
          return;
        }
      }
      const sn = ++this.service._snMessage;
      const ts = Date.now();
      for (const exporter of this.service.exporters.values()) {
        if ((exporter.levels?.[this.name] ?? exporter.levels?.default ?? this.level ?? 1) < level) continue;
        const message = {
          sn,
          ts,
          type,
          level,
          name: this.name,
          ...this.meta,
          args
        };
        exporter.export(message);
      }
    };
  }
};
var c16 = [
  6,
  2,
  3,
  4,
  5,
  1
];
var c256 = [
  20,
  21,
  26,
  27,
  32,
  33,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  56,
  57,
  62,
  63,
  68,
  69,
  74,
  75,
  76,
  77,
  78,
  79,
  80,
  81,
  92,
  93,
  98,
  99,
  112,
  113,
  129,
  134,
  135,
  148,
  149,
  160,
  161,
  162,
  163,
  164,
  165,
  166,
  167,
  168,
  169,
  170,
  171,
  172,
  173,
  178,
  179,
  184,
  185,
  196,
  197,
  198,
  199,
  200,
  201,
  202,
  203,
  204,
  205,
  206,
  207,
  208,
  209,
  214,
  215,
  220,
  221
];
var LoggerService = class LoggerService2 {
  bufferSize = 1e3;
  buffer = [];
  ctx;
  _snMessage = 0;
  _snExporter = 0;
  exporters = /* @__PURE__ */ new Map();
  constructor(ctx) {
    const tracker = {
      property: "ctx",
      noShadow: true
    };
    const self = createCallable("logger", joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
    Object.assign(self, this);
    self.ctx = ctx;
    defineProperty(self, symbols.tracker, tracker);
    self.exporter({
      colors: 3,
      export: (message) => {
        self.buffer.push(message);
        if (self.buffer.length > self.bufferSize) self.buffer = self.buffer.slice(-self.bufferSize);
      }
    });
    return self;
  }
  /**
  * Register an exporter and dispose it with the current fiber.
  *
  * @param exporter — the sink that receives structured log messages.
  * @returns a disposer that removes the exporter.
  */
  exporter(exporter) {
    return this.ctx.effect(() => {
      this.exporters.set(++this._snExporter, exporter);
      return () => this.exporters.delete(this._snExporter);
    }, "ctx.logger.exporter()");
  }
  _resolveConfig() {
    let intercept = this.ctx[symbols.intercept];
    const configs = [];
    while ("logger" in intercept) {
      if (Object.hasOwn(intercept, "logger")) configs.unshift(intercept["logger"]);
      intercept = Object.getPrototypeOf(intercept);
    }
    return Object.assign({}, ...configs);
  }
  [symbols.invoke](name2) {
    const config = this._resolveConfig();
    const fiber = (this.ctx[symbols.shadow] ?? this.ctx).fiber;
    name2 ??= config.name;
    name2 ??= hyphenate(fiber.name);
    return new Logger({
      name: name2,
      level: config.level,
      meta: { fiber: new WeakRef(fiber) }
    }, this);
  }
  static {
    for (const type of [
      "error",
      "info",
      "warn",
      "debug"
    ]) LoggerService2.prototype[type] = function(...args) {
      return this()[type](...args);
    };
  }
};
function enhanceError(error) {
  const lines = error.stack.split("\n");
  lines.splice(0, 2, `Error: ${error.message}`);
  error.stack = lines.join("\n");
  return error;
}
var RESERVED_WORDS = ["prototype", "then"];
function isSpecialProperty(prop) {
  return typeof prop === "symbol" || RESERVED_WORDS.includes(prop) || parseInt(prop).toString() === prop || prop.startsWith("_");
}
var ReflectService = class {
  ctx;
  /** Proxy traps implementing service resolution for every context object. */
  static handler = {
    get: (target, prop, ctx) => {
      if (isSpecialProperty(prop)) return Reflect.get(target, prop, ctx);
      if (Reflect.has(target, prop)) return getTraceable(ctx, Reflect.get(target, prop, ctx));
      const error = /* @__PURE__ */ new Error(`cannot get property "${prop}" without inject`);
      try {
        const def = target.reflect.props[prop];
        if (def?.type === "accessor") return def.get.call(ctx, ctx[symbols.receiver], error);
        if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false);
        return ctx.events.waterfall("internal/get", ctx, prop, error, () => {
          const key = target[symbols.isolate][prop];
          let fiber = (ctx[symbols.shadow] ?? ctx).fiber;
          while (true) {
            const impl = fiber.store?.[prop];
            if (impl) return getTraceable(ctx, impl.value);
            if (prop in fiber.inject) {
              error.message = `cannot get required service "${prop}" in inactive context`;
              throw error;
            }
            if (!fiber.runtime) throw error;
            if (fiber.parent[symbols.isolate][prop] !== key) throw error;
            fiber = fiber.parent.fiber;
          }
        });
      } catch (e) {
        throw e === error ? enhanceError(e) : e;
      }
    },
    set: (target, prop, value, ctx) => {
      if (isSpecialProperty(prop)) return Reflect.set(target, prop, value, ctx);
      const error = /* @__PURE__ */ new Error(`cannot set property "${prop}" without provide`);
      const def = target.reflect.props[prop];
      if (!def) {
        if (!ctx.fiber.runtime) return Reflect.set(target, prop, value, ctx);
        throw enhanceError(error);
      }
      try {
        if (def.type === "accessor") {
          if (!def.set) return false;
          return def.set.call(ctx, value, ctx[symbols.receiver], error);
        }
        return ctx.events.waterfall("internal/set", ctx, prop, value, error, () => {
          return ctx.reflect.set(prop, value, error);
        });
      } catch (e) {
        throw e === error ? enhanceError(e) : e;
      }
    },
    has: (target, prop) => {
      if (isSpecialProperty(prop)) return Reflect.has(target, prop);
      if (Reflect.has(target, prop)) return true;
      return !!target.reflect.props[prop];
    }
  };
  /** Service implementations, keyed by isolation label. */
  store = /* @__PURE__ */ Object.create(null);
  /** Declared context properties (services and accessors), by name. */
  props = /* @__PURE__ */ Object.create(null);
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
    this.mixin("reflect", [
      "get",
      "set",
      "provide",
      "accessor",
      "mixin"
    ]);
    this.mixin("fiber", ["runtime", "effect"]);
    this.mixin("registry", ["inject", "plugin"]);
    this.mixin("events", [
      "on",
      "once",
      "parallel",
      "emit",
      "serial",
      "bail",
      "waterfall"
    ]);
  }
  /**
  * Read a service from the store without the inject requirement.
  *
  * @param name — the service name.
  * @param strict — when `true`, only return implementations whose providing
  * fiber is currently active.
  * @returns the service value, or `undefined` when not (yet) provided.
  */
  get(name2, strict = true) {
    return getTraceable(this.ctx, this._getImpl(name2, strict)?.value);
  }
  _getImpl(name2, strict = true) {
    const key = this.ctx[symbols.isolate][name2];
    const impl = key && this.store[key];
    if (!impl) return;
    if (strict && impl.fiber.state !== 2) return;
    return impl;
  }
  /**
  * Overwrite a provided service's value.
  *
  * @param name — the service name.
  * @param value — the new service value.
  * @param error — carrier for the caller stack in diagnostics.
  * @returns `true` on success.
  * @throws when `name` was never provided, or was provided by another fiber.
  */
  set(name2, value, error) {
    const key = this.ctx[symbols.isolate][name2];
    const impl = this.store[key];
    if (!impl) throw new Error(`cannot set property "${name2}" without provide`);
    if (impl.fiber !== this.ctx.fiber) throw new Error(`cannot set property "${name2}" in multiple fibers`);
    impl.value = value;
    return true;
  }
  /**
  * Register a service implementation owned by the current fiber.
  *
  * See the `ctx.provide()` overload above for the full contract.
  *
  * @param name — the service name.
  * @param value — the service value.
  * @param check — optional availability predicate for dependents.
  * @returns a disposer that unregisters the service.
  */
  provide(name2, value, check) {
    return this.ctx.fiber.effect(() => {
      if (!this.props[name2]) this.props[name2] ??= { type: "service" };
      else if (this.props[name2].type !== "service") throw new Error(`property "${name2}" is already declared as ${this.props[name2].type}`);
      this.props[name2] = { type: "service" };
      this.ctx.root[symbols.isolate][name2] ??= Symbol(name2);
      const key = this.ctx[symbols.isolate][name2];
      const impl = {
        name: name2,
        value,
        fiber: this.ctx.fiber,
        check
      };
      if (this.store[key]) throw new Error(`service "${name2}" has been registered at <${this.store[key].fiber.name}>`);
      this.store[key] = impl;
      this.ctx.fiber.store[name2] = impl;
      if (this.ctx.fiber.state === 2) this.notify([name2]);
      return async () => {
        delete this.store[key];
        const fibers = this.notify([name2]);
        await Promise.allSettled(fibers.map((fiber) => fiber.await()));
        delete this.ctx.fiber.store[name2];
      };
    }, `ctx.provide(${JSON.stringify(name2)})`);
  }
  /**
  * Re-evaluate every fiber that requires one of the given services.
  *
  * @param names — the service names that changed.
  * @param filter — restricts notification to matching isolation scopes.
  * @returns the fibers whose dependency state was refreshed.
  */
  notify(names, filter = (ctx, name2) => ctx[symbols.isolate][name2] === this.ctx[symbols.isolate][name2]) {
    const fibers = [];
    for (const runtime of this.ctx.registry.values()) for (const fiber of runtime.fibers) {
      let hasUpdate = false;
      for (const name2 of names) {
        if (!(name2 in fiber.inject)) continue;
        if (!filter(fiber.ctx, name2)) continue;
        hasUpdate = true;
        fiber._checkImpl(name2);
      }
      if (!hasUpdate) continue;
      fiber._refresh();
      fibers.push(fiber);
    }
    for (const name2 of names) {
      const self = Object.create(this.ctx);
      self[symbols.filter] = (target) => filter(target, name2);
      this.ctx.events.emit(self, "internal/service", name2, this._getImpl(name2, false)?.value);
    }
    return fibers;
  }
  /**
  * Define a computed context property backed by get/set hooks.
  *
  * @param name — the context property name.
  * @param options — the `get` hook and optional `set` hook.
  * @returns a disposer that removes the accessor.
  */
  accessor(name2, options) {
    return this.ctx.fiber.effect(() => {
      if (name2 in this.props) throw new Error(`property "${name2}" is already declared as ${this.props[name2].type}`);
      this.props[name2] = {
        type: "accessor",
        ...options
      };
      return () => delete this.props[name2];
    }, `ctx.accessor(${JSON.stringify(name2)})`);
  }
  /**
  * Expose selected members of a service directly on `ctx`.
  *
  * See the `ctx.mixin()` overload above for the full contract.
  *
  * @param source — a context property name or a source object.
  * @param mixins — keys to forward, or a source-key → ctx-key map.
  * @returns a disposer that removes all created accessors.
  */
  mixin(source, mixins) {
    const self = this;
    return this.ctx.fiber.effect(function* () {
      const entries = Array.isArray(mixins) ? mixins.map((key) => [key, key]) : Object.entries(mixins);
      const getTarget = (ctx, error) => {
        return ctx[source];
      };
      for (const [key, value] of entries) yield self.accessor(value, {
        get(receiver, error) {
          const service = getTarget(this, error);
          if (isNullable(service)) return service;
          const mixin = receiver ? withProps(receiver, service) : service;
          const value2 = Reflect.get(service, key, mixin);
          if (typeof value2 !== "function") return value2;
          return value2.bind(mixin ?? service);
        },
        set(value2, receiver, error) {
          const service = getTarget(this, error);
          const mixin = receiver ? withProps(receiver, service) : service;
          return Reflect.set(service, key, value2, mixin);
        }
      });
    }, `ctx.mixin(${JSON.stringify(source)})`);
  }
  /**
  * Attach this context's tracing wrapper to a value.
  *
  * @param value — the value to wrap.
  * @returns the traceable wrapper (or the value itself when not applicable).
  */
  trace(value) {
    return getTraceable(this.ctx, value);
  }
  /**
  * Wrap a callback so calls trace `this` and arguments to this context.
  *
  * @param callback — the function to wrap.
  * @returns a proxy delegating to `callback` with traced values.
  */
  bind(callback) {
    return new Proxy(callback, {
      apply: (target, thisArg, args) => {
        return Reflect.apply(target, this.trace(thisArg), args.map((arg) => this.trace(arg)));
      },
      construct: (target, args, newTarget) => {
        return Reflect.construct(target, args.map((arg) => this.trace(arg)), newTarget);
      }
    });
  }
};
var kValidationError = Symbol.for("ValidationError");
var ValidationError = class extends TypeError {
  name = "ValidationError";
  /**
  * Build the aggregated message from schema issues.
  *
  * @param issues — the standard-schema issues, one message line each.
  */
  constructor(issues) {
    super(`invalid config:
` + issues.map((issue) => {
      if (issue.path) return `  - ${issue.message} (at ${issue.path.join(".")})`;
      else return `  - ${issue.message}`;
    }).join("\n"));
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
function resolveConfig(runtime, config) {
  if (!runtime.Config) return config;
  const result = runtime.Config["~standard"].validate(config);
  if ("then" in result) throw new TypeError("Async config validation is not supported");
  if (result.issues) throw new ValidationError(result.issues);
  else return result.value;
}
var effectInertia = /* @__PURE__ */ new WeakMap();
function runDisposable(dispose) {
  const result = dispose();
  return effectInertia.get(dispose)?.() ?? result;
}
function emitPluginDisposed(context, fiber) {
  const args = ["internal/plugin", fiber];
  let callbacks;
  try {
    callbacks = context.events.dispatch("emit", args);
  } catch (error) {
    context.logger.error(error);
    return;
  }
  for (const callback of callbacks) try {
    const returned = callback(...args);
    Promise.resolve(returned).catch((error) => context.logger.error(error));
  } catch (error) {
    context.logger.error(error);
  }
}
var CordisError = class CordisError2 extends Error {
  code;
  /**
  * @param code — the stable error code; also the default message.
  * @param message — optional human-readable override.
  */
  constructor(code, message) {
    super(message ?? CordisError2.Code[code]);
    this.code = code;
  }
};
(function(CordisError3) {
  CordisError3.Code = { INACTIVE_EFFECT: "cannot create effect on inactive context" };
})(CordisError || (CordisError = {}));
var INACTIVE = "__INACTIVE__";
var Fiber = class {
  parent;
  inject;
  runtime;
  /** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
  uid;
  /** The context this fiber's plugin runs in (extends the parent context). */
  ctx;
  /** The validated plugin config (updated by `update()`). */
  config;
  /** The raw plugin config, re-resolved before each activation. */
  _config;
  /** Current lifecycle state; transitions emit `internal/status`. */
  state = 0;
  /** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
  dispose;
  /** Snapshot of required service implementations while loaded; `undefined` otherwise. */
  store;
  /** The in-flight load/unload transition, if one is currently running. */
  inertia;
  _hooks = /* @__PURE__ */ Object.create(null);
  _disposables = new DisposableList();
  context;
  _error;
  _runner;
  _store = /* @__PURE__ */ Object.create(null);
  /**
  * Create a fiber. Plugin authors normally obtain fibers from `ctx.plugin()`
  * rather than constructing them directly.
  *
  * @param parent — the context the plugin was loaded from.
  * @param config — raw config, validated against the runtime's schema.
  * @param inject — resolved dependency map (service name → intercept config).
  * @param runtime — the shared plugin runtime, or `null` for the root fiber.
  * @param getOuterStack — captures the caller stack for effect diagnostics.
  */
  constructor(parent, config, inject2, runtime, getOuterStack) {
    this.parent = parent;
    this.inject = inject2;
    this.runtime = runtime;
    this._config = config;
    const collect = (dispose) => {
      this._disposables.push(dispose);
    };
    if (runtime) {
      this.uid = parent.registry.counter;
      this.ctx = this.context = parent.extend({ fiber: this });
      const injectEntries = Object.entries(this.inject);
      if (injectEntries.length) {
        this.ctx[Context.intercept] = Object.create(parent[Context.intercept]);
        for (const [name2, config2] of injectEntries) {
          if (isNullable(config2)) continue;
          this.ctx[Context.intercept][name2] = config2;
        }
      }
      this._runner = {
        epoch: INACTIVE,
        getOuterStack,
        execute: function() {
          if (isConstructor(runtime.callback)) {
            const instance = new runtime.callback(this.ctx, this.config);
            for (const hook of instance?.[symbols.initHooks] ?? []) hook();
            return instance?.[symbols.init]?.();
          } else return runtime.callback(this.ctx, this.config);
        },
        collect
      };
      this.dispose = parent.fiber.effect(() => {
        const remove = runtime.fibers.push(this);
        return async () => {
          this.uid = null;
          emitPluginDisposed(this.context, this);
          if (this.ctx.registry.has(runtime.callback)) {
            remove();
            if (!runtime.fibers.length) this.ctx.registry.delete(runtime.callback);
          }
          this._setEpoch(INACTIVE);
          if (!this.inertia) this._updateState(() => {
            this.inertia = this._unload();
            return 5;
          });
          while (this.inertia) await this.inertia;
        };
      }, "ctx.plugin()");
      try {
        this.context.emit("internal/plugin", this);
      } catch (error) {
        Promise.resolve(this.dispose()).catch((reason) => this.ctx.logger.error(reason));
        throw error;
      }
      if (this.uid !== null && parent.fiber.state !== 5) {
        for (const name2 of Object.keys(this.inject)) this._checkImpl(name2);
        this._refresh();
      }
    } else {
      this.uid = 0;
      this.ctx = this.context = parent;
      this.state = 2;
      this.store = /* @__PURE__ */ Object.create(null);
      this._runner = {
        epoch: "",
        getOuterStack,
        execute: () => {
        },
        collect
      };
      this.dispose = () => this.restart();
    }
  }
  /** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
  get name() {
    let fiber = this;
    do {
      if (fiber.runtime?.name) return fiber.runtime.name;
      fiber = fiber.parent.fiber;
    } while (fiber !== fiber.parent.fiber);
    return "root";
  }
  /**
  * Throw if the fiber has already been disposed.
  *
  * @returns nothing when the fiber is still active.
  * @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
  */
  assertActive() {
    if (this.uid !== null) return;
    throw new CordisError("INACTIVE_EFFECT");
  }
  _execute(runner) {
    const oldEpoch = runner.epoch;
    return composeError((info) => {
      const safeCollect = (dispose) => {
        if (typeof dispose === "function") runner.collect(dispose);
        else if (!isNullable(dispose)) throw new TypeError("Invalid effect");
      };
      const effect = runner.execute.call(this);
      if (typeof effect === "function") return runner.collect(effect);
      else if (isNullable(effect)) {
      } else if (!isObject(effect)) throw new TypeError("Invalid effect");
      else if ("then" in effect) return effect.then(safeCollect);
      else if (Symbol.iterator in effect) {
        info.error = /* @__PURE__ */ new Error();
        const iter = effect[Symbol.iterator]();
        while (true) {
          const result = iter.next();
          safeCollect(result.value);
          if (result.done) return;
        }
      } else if (Symbol.asyncIterator in effect) {
        const iter = effect[Symbol.asyncIterator]();
        return (async () => {
          await Promise.resolve();
          info.error = /* @__PURE__ */ new Error();
          while (true) {
            if (runner.epoch !== oldEpoch) return;
            const result = await iter.next();
            safeCollect(result.value);
            if (result.done) return;
          }
        })();
      } else throw new TypeError("Invalid effect");
    }, runner.getOuterStack);
  }
  effect(execute, label = "anonymous") {
    this.assertActive();
    if (this.state === 5) throw new CordisError("INACTIVE_EFFECT");
    const disposables = [];
    let disposing = false;
    let disposalTask;
    const dispose = () => {
      if (disposing) return disposalTask;
      disposing = true;
      let task2;
      for (const disposable of disposables.splice(0).reverse()) if (task2) task2 = task2.then(() => runDisposable(disposable));
      else {
        const result = runDisposable(disposable);
        if (isObject(result) && "then" in result) task2 = result;
      }
      return disposalTask = task2;
    };
    const meta = {
      label,
      children: []
    };
    const runner = {
      execute,
      epoch: true,
      collect: (dispose2) => {
        disposables.push(dispose2);
        this._disposables.delete(dispose2);
        if (dispose2[symbols.effect]) meta.children.push(dispose2[symbols.effect]);
      },
      getOuterStack: buildOuterStack()
    };
    let task;
    let executing = true;
    let resolveSetup;
    let rejectSetup;
    let setupBarrier;
    let setupFailed = false;
    let inFlight;
    let removeWrapper = () => false;
    const waitForSetup = () => {
      setupBarrier ??= new Promise((resolve2, reject) => {
        resolveSetup = resolve2;
        rejectSetup = reject;
      });
      return setupBarrier;
    };
    const disposeAfter = (setup) => {
      return Promise.resolve(setup).then(() => dispose(), async (reason) => {
        await dispose();
        throw reason;
      });
    };
    const finalizeDisposal = (callback) => {
      let result;
      try {
        result = callback();
      } catch (error) {
        removeWrapper();
        throw error;
      }
      if (isObject(result) && "then" in result) {
        const pending = Promise.resolve(result).finally(() => {
          removeWrapper();
          if (inFlight === pending) inFlight = void 0;
        });
        return inFlight = pending;
      }
      removeWrapper();
      return result;
    };
    const wrapper = defineProperty(() => {
      if (!runner.epoch) return setupFailed ? inFlight : void 0;
      runner.epoch = false;
      return finalizeDisposal(() => {
        if (executing) return disposeAfter(waitForSetup());
        return task ? disposeAfter(task) : dispose();
      });
    }, symbols.effect, meta);
    effectInertia.set(wrapper, () => inFlight);
    removeWrapper = this._disposables.push(wrapper);
    try {
      task = this._execute(runner);
    } catch (reason) {
      executing = false;
      setupFailed = true;
      runner.epoch = false;
      let cleanup;
      try {
        cleanup = finalizeDisposal(dispose);
      } finally {
        rejectSetup?.(reason);
      }
      if (isObject(cleanup) && "then" in cleanup) cleanup.catch((error) => this.ctx.logger.error(error));
      throw reason;
    }
    executing = false;
    if (setupBarrier) Promise.resolve(task).then(resolveSetup, rejectSetup);
    task?.catch(() => {
      if (!runner.epoch) return dispose();
      return finalizeDisposal(dispose);
    }).catch((error) => this.ctx.logger.error(error));
    const disposeAsync = () => {
      if (!runner.epoch) return;
      runner.epoch = false;
      return finalizeDisposal(dispose);
    };
    wrapper.then = async (onFulfilled, onRejected) => {
      return Promise.resolve(task).then(() => disposeAsync).then(onFulfilled, onRejected);
    };
    return wrapper;
  }
  /**
  * Return metadata for currently registered effects.
  *
  * @returns one {@link EffectMeta} tree per labeled live effect.
  */
  getEffects() {
    return [...this._disposables].map((dispose) => dispose[symbols.effect]).filter(Boolean);
  }
  _getState() {
    if (this.uid === null) return 4;
    if (this._error) return 3;
    if (this._runner.epoch !== INACTIVE) return 2;
    return 0;
  }
  _updateState(callback) {
    const oldState = this.state;
    this.state = callback() ?? this._getState();
    if (oldState === this.state) return;
    this.context.emit("internal/status", this, oldState);
    if (oldState !== 2 && this.state !== 2) return;
    for (const key of Reflect.ownKeys(this.ctx.reflect.store)) {
      const impl = this.ctx.reflect.store[key];
      if (impl.fiber !== this) continue;
      this.ctx.reflect.notify([impl.name]);
    }
  }
  _checkImpl(name2) {
    const impl = this.ctx.reflect._getImpl(name2, true);
    if (!impl) return delete this._store[name2];
    try {
      if (impl.check && !impl.check.call(getTraceable(this.ctx, impl.value))) return delete this._store[name2];
    } catch (error) {
      impl.fiber.ctx.logger.error(error);
      return delete this._store[name2];
    }
    this._store[name2] = impl;
  }
  _refresh() {
    let epoch = false;
    epoch = "";
    for (const name2 of Object.keys(this.inject)) {
      const impl = this._store[name2];
      if (!impl) {
        epoch = INACTIVE;
        break;
      }
      epoch += ":" + impl.fiber.uid;
    }
    this._setEpoch(epoch);
  }
  _setEpoch(epoch) {
    const oldEpoch = this._runner.epoch;
    if (epoch === oldEpoch) return;
    this._runner.epoch = epoch;
    if (this.inertia) return;
    this._updateState(() => {
      if (epoch !== INACTIVE && oldEpoch === INACTIVE) {
        this.inertia = this._reload();
        return 1;
      } else {
        this.inertia = this._unload();
        return 5;
      }
    });
  }
  _resolveConfig(config) {
    config = this.context.waterfall(this, "internal/config", config, () => config);
    return this.runtime ? resolveConfig(this.runtime, config) : config;
  }
  async _reload() {
    this.store = { ...this._store };
    const oldEpoch = this._runner.epoch;
    try {
      await Promise.resolve();
      if (this._runner.epoch === oldEpoch) {
        this.config = this._resolveConfig(this._config);
        await this._execute(this._runner);
        this._error = void 0;
      }
    } catch (reason) {
      this.ctx.logger.error(reason);
      this._error = reason;
      this._runner.epoch = INACTIVE;
    }
    this._updateState(() => {
      if (this._runner.epoch === oldEpoch) this.inertia = void 0;
      else {
        this.inertia = this._unload();
        return 5;
      }
    });
  }
  async _unload() {
    await Promise.all(this._disposables.clear().map(async (dispose) => {
      try {
        await composeError(async (info) => {
          await Promise.resolve();
          info.error = /* @__PURE__ */ new Error();
          await runDisposable(dispose);
        }, this._runner.getOuterStack);
      } catch (reason) {
        this.ctx.logger.error(reason);
      }
    }));
    this.store = void 0;
    this._updateState(() => {
      if (this._runner.epoch === INACTIVE) this.inertia = void 0;
      else {
        this.inertia = this._reload();
        return 1;
      }
    });
  }
  /**
  * Wait for current lifecycle work and rethrow startup errors.
  *
  * @returns this fiber, once it has settled into a stable state.
  * @throws the config-validation or plugin-startup error, if any.
  */
  async await() {
    while (this.inertia) await this.inertia;
    if (this._error) throw this._error;
    return this;
  }
  /**
  * Dispose and immediately reload this plugin with its current config.
  *
  * @returns a promise resolving once the reload settled.
  * @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
  */
  async restart() {
    this.assertActive();
    this._setEpoch(INACTIVE);
    this._refresh();
    await this.await();
  }
  /**
  * Validate and apply new config, then restart the plugin.
  *
  * Runs the `internal/update` waterfall first, so update hooks (and HMR)
  * can veto or replace the restart.
  *
  * @param config — the new raw config; validated before anything restarts.
  * @param noSave — hint for persistence hooks not to write the change back.
  * @returns the update waterfall result; the default restart returns a promise.
  * @throws when validation, an update listener, or the restarted plugin fails.
  */
  update(config, noSave = false) {
    this.assertActive();
    this._config = config;
    if (this.state !== 2) {
      this._error = void 0;
      this._setEpoch(INACTIVE);
      this._refresh();
      return;
    }
    config = this._resolveConfig(config);
    return this.context.waterfall(this, "internal/update", config, noSave, () => {
      this.config = config;
      this._error = void 0;
      return this.restart();
    });
  }
};
function isApplicable(object) {
  return object && typeof object === "object" && typeof object.apply === "function";
}
function Inject(name2, config) {
  return function(value, decorator) {
    if (decorator.kind === "class") {
      if (!Object.hasOwn(value, "inject")) {
        defineProperty(value, "inject", Object.create(Object.getPrototypeOf(value).inject ?? null));
        defineProperty(value.inject, symbols.checkProto, true);
      }
      value.inject[name2] = config;
    } else if (decorator.kind === "method") {
      const inject2 = (value[symbols.metadata] ??= {}).inject ??= /* @__PURE__ */ Object.create(null);
      inject2[name2] = config;
      decorator.addInitializer(function() {
        const property = this[symbols.tracker]?.property;
        (this[symbols.initHooks] ??= []).push(() => {
          this.ctx.inject(inject2, (ctx) => {
            return value.call(property ? withProps(this, { [property]: ctx }) : this);
          });
        });
      });
    } else throw new Error("@Inject() can only be used on class or class methods");
  };
}
(function(Inject2) {
  function resolve2(inject2, result = /* @__PURE__ */ Object.create(null)) {
    if (!inject2) return result;
    if (Array.isArray(inject2)) for (const name2 of inject2) result[name2] = null;
    else if (Reflect.has(inject2, symbols.checkProto)) {
      Object.assign(result, resolve2(Object.getPrototypeOf(inject2)));
      for (const name2 of Object.keys(inject2)) result[name2] = inject2[name2] ?? null;
    } else for (const name2 of Object.keys(inject2)) result[name2] = inject2[name2] ?? null;
    return result;
  }
  Inject2.resolve = resolve2;
})(Inject || (Inject = {}));
var RegistryService = class {
  ctx;
  _counter = 0;
  _internal = /* @__PURE__ */ new Map();
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
  }
  /** Allocate the next fiber uid (increments on every read). */
  get counter() {
    return ++this._counter;
  }
  /** Number of registered plugin runtimes. */
  get size() {
    return this._internal.size;
  }
  /**
  * Resolve a supported plugin shape to its executable callback.
  *
  * @param plugin — a function, class, or `{ apply }` object plugin.
  * @returns the callback identifying the plugin, or `undefined` if invalid.
  */
  resolve(plugin) {
    try {
      if (typeof plugin === "function") return plugin;
      if (isApplicable(plugin)) return plugin.apply;
    } catch {
    }
  }
  /**
  * Look up the runtime record for a plugin.
  *
  * @param plugin — any supported plugin shape.
  * @returns the runtime, or `undefined` when the plugin is not registered.
  */
  get(plugin) {
    const key = this.resolve(plugin);
    return key && this._internal.get(key);
  }
  /**
  * Check whether a plugin has a registered runtime.
  *
  * @param plugin — any supported plugin shape.
  * @returns `true` when at least one fiber of the plugin exists.
  */
  has(plugin) {
    const key = this.resolve(plugin);
    return !!key && this._internal.has(key);
  }
  /**
  * Dispose every running fiber for a plugin and remove its runtime record.
  *
  * @param plugin — any supported plugin shape.
  * @returns the removed runtime, or `undefined` when none was registered.
  */
  delete(plugin) {
    const key = this.resolve(plugin);
    const runtime = key && this._internal.get(key);
    if (!runtime) return;
    this._internal.delete(key);
    for (const fiber of runtime.fibers) fiber.dispose();
    return runtime;
  }
  /** Iterate the registered plugin callbacks. */
  keys() {
    return this._internal.keys();
  }
  /** Iterate the registered plugin runtimes. */
  values() {
    return this._internal.values();
  }
  /** Iterate `[callback, runtime]` pairs. */
  entries() {
    return this._internal.entries();
  }
  /**
  * Visit every registered runtime.
  *
  * @param callback — receives each runtime and its identifying callback.
  */
  forEach(callback) {
    return this._internal.forEach(callback);
  }
  /**
  * Start a callback once the requested dependencies are available.
  *
  * @param inject — required services, as an array or a name → config map.
  * @param callback — plugin body called with `(ctx, config)`.
  * @returns the fiber; awaiting it settles once loading finished.
  */
  inject(inject2, callback) {
    return this.plugin({
      inject: inject2,
      apply: callback,
      name: callback.name
    });
  }
  /**
  * Start a plugin in the current context and return its fiber.
  *
  * Creates (or reuses) the plugin's runtime record, then starts a new fiber
  * under the current context. Throws if `plugin` is not a supported shape or
  * if the current fiber is already disposed.
  *
  * @param plugin — a function, class, or `{ apply }` object plugin.
  * @param config — the plugin config, validated against its `Config` schema.
  * @param getOuterStack — captures the caller stack for effect diagnostics.
  * @returns the fiber; awaiting it settles once loading finished.
  */
  plugin(plugin, config, getOuterStack = buildOuterStack()) {
    const callback = this.resolve(plugin);
    if (!callback) throw new Error('invalid plugin, expect function or object with an "apply" method, received ' + typeof plugin);
    this.ctx.fiber.assertActive();
    let runtime = this._internal.get(callback);
    if (!runtime) {
      let name2 = plugin.name;
      if (name2 === "apply") name2 = void 0;
      runtime = {
        name: name2,
        callback,
        fibers: new DisposableList(),
        Config: plugin.Config
      };
      this._internal.set(callback, runtime);
    }
    const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack);
    const wrapped = Object.create(fiber);
    wrapped.then = (onFulfilled, onRejected) => {
      return fiber.await().then(onFulfilled, onRejected);
    };
    return wrapped;
  }
};
var Context = class Context2 {
  /** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
  static effect = symbols.effect;
  /** Symbol key for a context's listener filter, consulted on every event dispatch. */
  static filter = symbols.filter;
  /** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
  static isolate = symbols.isolate;
  /** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
  static intercept = symbols.intercept;
  /**
  * Returns true for Cordis context proxies and context prototypes.
  *
  * Works across realms and across multiple copies of cordis, because the
  * brand is keyed by a global symbol rather than by `instanceof`.
  *
  * @param value — the value to test.
  * @returns `true` if `value` is a Cordis context, narrowing its type.
  */
  static is(value) {
    return !!value?.[Context2.is];
  }
  static {
    Context2.is[Symbol.toPrimitive] = () => Symbol.for("cordis.is");
    Context2.prototype[Context2.is] = true;
  }
  /** Create the root context and install the built-in services. */
  constructor() {
    this[symbols.isolate] = /* @__PURE__ */ Object.create(null);
    this[symbols.intercept] = /* @__PURE__ */ Object.create(null);
    const self = new Proxy(this, ReflectService.handler);
    this.root = self;
    this.baseUrl = void 0;
    this.fiber = new Fiber(self, {}, /* @__PURE__ */ Object.create(null), null, () => []);
    this.reflect = new ReflectService(self);
    this.registry = new RegistryService(self);
    this.events = new EventsService(self);
    this.logger = new LoggerService(self);
    this.fiber._disposables.clear();
    return self;
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `Context <${this.fiber.name}>`;
  }
  /**
  * Create a child context with extra metadata on top of the current scope.
  *
  * The child prototypally inherits every property of this context; own
  * properties of `meta` shadow the inherited ones. The parent is not mutated.
  *
  * @param meta — own properties (including symbol keys) to define on the child.
  * @returns a child context inheriting from this one.
  */
  extend(meta = {}) {
    const shadow = Reflect.getOwnPropertyDescriptor(this, symbols.shadow)?.value;
    const self = Object.create(getTraceable(this, this));
    for (const prop of Reflect.ownKeys(meta)) Object.defineProperty(self, prop, Reflect.getOwnPropertyDescriptor(meta, prop));
    if (!shadow) return self;
    return Object.assign(Object.create(self), { [symbols.shadow]: shadow });
  }
  /**
  * Create a child context with an independent service scope for `name`.
  *
  * Below the returned context, reads and writes of the service `name`
  * resolve against the new label instead of the parent's, so a different
  * implementation can be provided without affecting the parent scope.
  * Passing the same `label` to two `isolate()` calls joins their scopes.
  *
  * @param name — the service name to isolate.
  * @param label — scope label to join; defaults to a fresh unique symbol.
  * @returns a child context whose `name` service resolves in the new scope.
  */
  isolate(name2, label) {
    const shadow = Object.create(this[symbols.isolate]);
    shadow[name2] = label ?? Symbol(name2);
    return this.extend({ [symbols.isolate]: shadow });
  }
  intercept(name2, config) {
    const intercept = Object.create(this[symbols.intercept]);
    intercept[name2] = config;
    return this.extend({ [symbols.intercept]: intercept });
  }
};
var Service = class Service2 {
  ctx;
  /** Symbol key of an instance method run after construction (class plugins). */
  static init = symbols.init;
  /** Symbol key of the availability predicate passed to `ctx.provide()`. */
  static check = symbols.check;
  /** Symbol key of the phantom intercept-config type parameter. */
  static config = symbols.config;
  /** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
  static invoke = symbols.invoke;
  /** Symbol key of the helper deriving an extended service instance. */
  static extend = symbols.extend;
  /** Symbol key of the tracker metadata used for context tracing. */
  static tracker = symbols.tracker;
  /** Symbol key of the intercept-config resolution helper below. */
  static resolveConfig = symbols.resolveConfig;
  /** The service name this instance is registered under. */
  name;
  /**
  * Register this instance as `name` in the current context.
  *
  * Calls `ctx.reflect.provide(name, this, this[Service.check])`, so the
  * service is unregistered automatically when the owning fiber unloads.
  * Services with a `[Service.invoke]` body return a callable instance.
  *
  * @param ctx — the context to register in (stored as `this.ctx`).
  * @param name — the service name; defaults to the static `provide` field.
  */
  constructor(ctx, name2) {
    this.ctx = ctx;
    name2 ??= this.constructor["provide"];
    let self = this;
    const tracker = {
      associate: name2,
      property: "ctx"
    };
    if (self[symbols.invoke]) self = createCallable(name2, joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
    self.ctx = ctx;
    self.name = name2;
    defineProperty(self, symbols.tracker, tracker);
    self.ctx.reflect.provide(name2, self, this[symbols.check]);
    return self;
  }
  [symbols.filter](ctx) {
    return ctx[symbols.isolate][this.name] === this.ctx[symbols.isolate][this.name];
  }
  [symbols.extend](props) {
    let self;
    if (this[Service2.invoke]) self = createCallable(this.name, this, this[symbols.tracker]);
    else self = Object.create(this);
    return Object.assign(self, props);
  }
  /**
  * Merge intercept config from ancestors with optional base and head values.
  *
  * Entries added closer to the root apply first; `base` is prepended and
  * `head` appended. Uses `Config.merge` when the service declares one,
  * otherwise a shallow `Object.assign`.
  *
  * @param base — lowest-precedence config merged before all intercepts.
  * @param head — highest-precedence config merged after all intercepts.
  * @returns the merged config.
  */
  [symbols.resolveConfig](base, head) {
    let intercept = this.ctx[Context.intercept];
    const configs = [];
    while (this.name in intercept) {
      if (Object.hasOwn(intercept, this.name)) configs.unshift(intercept[this.name]);
      intercept = Object.getPrototypeOf(intercept);
    }
    if (base) configs.unshift(base);
    if (head) configs.push(head);
    if (this["Config"]?.merge) return this["Config"].merge(...configs);
    else return Object.assign({}, ...configs);
  }
  static [Symbol.hasInstance](instance) {
    if (!instance) return false;
    let constructor = instance.constructor;
    while (constructor) {
      constructor = constructor.prototype?.constructor;
      if (constructor === this) return true;
      constructor &&= Object.getPrototypeOf(constructor);
    }
    return false;
  }
};

// node_modules/@deepseek-ai/dsh-storage/lib/index.js
var UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/;

// node_modules/@deepseek-ai/dsh-storage-domain/lib/index.js
function domainTable(schema) {
  return { valueSchema: schema };
}
function defineDomain(spec) {
  if (!UNIT_NAME_RE.test(spec.name)) throw new Error(`domain name '${spec.name}' must match ${UNIT_NAME_RE}`);
  if (!Number.isInteger(spec.version) || spec.version < 0) throw new Error(`domain '${spec.name}' version must be a non-negative integer, got ${spec.version}`);
  for (const compat of spec.compatibleVersions ?? []) if (!Number.isInteger(compat) || compat < 0 || compat >= spec.version) throw new Error(`domain '${spec.name}' compatibleVersions entries must be non-negative integers below version ${spec.version}, got ${compat}`);
  if (spec.layout !== void 0) {
    const layout = spec.layout;
    if (layout !== "single" && layout !== "per-record") throw new Error(`domain '${spec.name}' layout must be 'single' or 'per-record', got ${layout}`);
  }
  if (spec.invalidRecords !== void 0) {
    const policy = spec.invalidRecords;
    if (policy !== "backup-and-skip") throw new Error(`domain '${spec.name}' invalidRecords must be 'backup-and-skip' when present, got ${policy}`);
  }
  for (const table of Object.keys(spec.tables)) if (!UNIT_NAME_RE.test(table)) throw new Error(`domain '${spec.name}' table name '${table}' must match ${UNIT_NAME_RE}`);
  if (spec.global !== void 0 && spec.global.schema.safeParse(null).success) throw new Error(`domain '${spec.name}' global schema must not accept null: null is the medium's "never written" sentinel, so a stored null could not round-trip`);
  return spec;
}
var Config = z.object({
  backend: z.string().required(),
  routes: z.dict(z.string()).default({})
});

// src/shared/wire.ts
import { z as z2 } from "zod";
var zAgentStatus = z2.enum(["active", "paused", "terminated"]);
var zAccessLevel = z2.enum(["none", "read", "write"]);
var zTaskStatus = z2.enum(["todo", "in_progress", "blocked", "review", "done", "cancelled"]);
var zMailKind = z2.enum(["info", "question", "request", "report", "announce", "approval_request", "approval_result", "task_notice", "system"]);
var zMailStatus = z2.enum(["pending", "delivered", "read"]);
var zApprovalKind = z2.enum(["hire", "spend", "strategy", "danger", "other"]);
var zApprovalStatus = z2.enum(["pending", "approved", "rejected"]);
var zScheduleKind = z2.enum(["cron", "every", "at"]);
var zPermissions = z2.object({
  projects: z2.record(z2.string(), zAccessLevel),
  tools: z2.array(z2.string()),
  canHire: z2.boolean(),
  canApprove: z2.boolean()
});
var zAgent = z2.object({
  id: z2.string(),
  name: z2.string(),
  title: z2.string(),
  role: z2.string(),
  managerId: z2.string().nullable(),
  /** 负责的项目（多选）。 */
  projectIds: z2.array(z2.string()).default([]),
  presetId: z2.string().nullable(),
  persona: z2.string(),
  provider: z2.string().nullable(),
  model: z2.string().nullable(),
  effort: z2.string().nullable(),
  sessionId: z2.string(),
  cwd: z2.string(),
  provisionedAt: z2.number().nullable(),
  status: zAgentStatus,
  permissions: zPermissions,
  dailyTokenCap: z2.number().nullable(),
  createdAt: z2.number(),
  updatedAt: z2.number()
});
var zProject = z2.object({
  id: z2.string(),
  name: z2.string(),
  description: z2.string(),
  rootPath: z2.string(),
  /** 代码仓库路径（员工工作目录）；公司档案目录仍是 rootPath。 */
  repoPath: z2.string().nullable(),
  /** 项目群会话 id（CEO 项目实例驱动；null = 尚未创建）。 */
  channelSessionId: z2.string().nullable().default(null),
  acl: z2.record(z2.string(), zAccessLevel),
  defaultAcl: zAccessLevel,
  createdBy: z2.string(),
  createdAt: z2.number()
});
var zDoc = z2.object({
  id: z2.string(),
  projectId: z2.string().nullable(),
  title: z2.string(),
  path: z2.string(),
  tags: z2.array(z2.string()),
  createdBy: z2.string(),
  updatedAt: z2.number()
});
var zTask = z2.object({
  id: z2.string(),
  title: z2.string(),
  desc: z2.string(),
  assigneeId: z2.string().nullable(),
  creatorType: z2.enum(["board", "agent", "system"]),
  creatorId: z2.string(),
  parentTaskId: z2.string().nullable(),
  projectId: z2.string().nullable(),
  status: zTaskStatus,
  priority: z2.number(),
  dueAt: z2.number().nullable(),
  checkoutBy: z2.string().nullable(),
  checkoutAt: z2.number().nullable(),
  result: z2.string().nullable(),
  createdAt: z2.number(),
  updatedAt: z2.number(),
  doneAt: z2.number().nullable()
});
var zComment = z2.object({
  id: z2.string(),
  taskId: z2.string(),
  authorType: z2.enum(["board", "agent", "system"]),
  authorId: z2.string(),
  authorName: z2.string(),
  text: z2.string(),
  createdAt: z2.number()
});
var zMessage = z2.object({
  id: z2.string(),
  fromType: z2.enum(["board", "agent", "system"]),
  fromId: z2.string(),
  fromName: z2.string(),
  toType: z2.enum(["board", "agent", "channel"]),
  toId: z2.string(),
  kind: zMailKind,
  taskId: z2.string().nullable(),
  body: z2.string(),
  status: zMailStatus,
  createdAt: z2.number(),
  deliveredAt: z2.number().nullable()
});
var zApproval = z2.object({
  id: z2.string(),
  kind: zApprovalKind,
  /** 批准后由服务自动执行的结构化动作（如 hire），null = 纯人工动作。 */
  action: z2.object({ kind: z2.string(), payload: z2.unknown() }).nullable().default(null),
  title: z2.string(),
  detail: z2.string(),
  requesterType: z2.enum(["board", "agent", "system"]),
  requesterId: z2.string(),
  requesterName: z2.string(),
  status: zApprovalStatus,
  decidedBy: z2.string().nullable(),
  decisionNote: z2.string().nullable(),
  createdAt: z2.number(),
  decidedAt: z2.number().nullable()
});
var zSchedule = z2.object({
  id: z2.string(),
  agentId: z2.string(),
  kind: zScheduleKind,
  cron: z2.string().nullable(),
  everySec: z2.number().nullable(),
  at: z2.number().nullable(),
  timeZone: z2.string(),
  prompt: z2.string(),
  enabled: z2.boolean(),
  nextRunAt: z2.number(),
  lastRunAt: z2.number().nullable(),
  lastOutcome: z2.string().nullable(),
  createdAt: z2.number()
});
var zWorklog = z2.object({
  key: z2.string(),
  agentId: z2.string(),
  date: z2.string(),
  inputTokens: z2.number(),
  outputTokens: z2.number(),
  cacheReadTokens: z2.number(),
  cacheWriteTokens: z2.number(),
  reasoningTokens: z2.number(),
  turns: z2.number(),
  activeMs: z2.number(),
  sessions: z2.array(z2.string()),
  updatedAt: z2.number()
});
var zActivity = z2.object({
  id: z2.string(),
  at: z2.number(),
  actorType: z2.enum(["board", "agent", "system"]),
  actorId: z2.string(),
  actorName: z2.string(),
  action: z2.string(),
  detail: z2.string()
});
var zCompanyState = z2.object({
  enabled: z2.boolean(),
  companyName: z2.string(),
  root: z2.string(),
  tickMs: z2.number(),
  now: z2.number(),
  today: z2.string(),
  agents: z2.array(zAgent),
  projects: z2.array(zProject),
  docs: z2.array(zDoc),
  tasks: z2.array(zTask),
  comments: z2.array(zComment),
  messages: z2.array(zMessage),
  approvals: z2.array(zApproval),
  schedules: z2.array(zSchedule),
  worklogs: z2.array(zWorklog),
  activity: z2.array(zActivity),
  residentIds: z2.array(z2.string()),
  stats: z2.object({
    agents: z2.number(),
    activeTasks: z2.number(),
    doneToday: z2.number(),
    pendingApprovals: z2.number(),
    unreadMail: z2.number(),
    tokensToday: z2.number(),
    inputToday: z2.number(),
    outputToday: z2.number(),
    cacheReadToday: z2.number(),
    cacheWriteToday: z2.number()
  })
});
var zActionResult = z2.object({
  ok: z2.boolean(),
  code: z2.string().optional(),
  message: z2.string().optional(),
  data: z2.unknown().optional()
});
var zHireInput = z2.object({
  name: z2.string(),
  title: z2.string(),
  role: z2.string(),
  managerId: z2.string().nullable(),
  projectIds: z2.array(z2.string()).optional(),
  persona: z2.string(),
  provider: z2.string().nullable(),
  model: z2.string().nullable(),
  effort: z2.string().nullable(),
  presetId: z2.string().nullable(),
  dailyTokenCap: z2.number().nullable(),
  permissions: zPermissions.partial().optional()
});
var zAgentPatch = zHireInput.partial().extend({
  status: zAgentStatus.optional(),
  permissions: zPermissions.optional()
});
var zTaskInput = z2.object({
  title: z2.string(),
  desc: z2.string().optional(),
  assigneeId: z2.string().nullable().optional(),
  projectId: z2.string().nullable().optional(),
  priority: z2.number().optional(),
  dueAt: z2.number().nullable().optional(),
  parentTaskId: z2.string().nullable().optional()
});
var zScheduleInput = z2.object({
  agentId: z2.string(),
  kind: zScheduleKind,
  spec: z2.string(),
  prompt: z2.string()
});
var zMailInput = z2.object({
  toId: z2.string(),
  kind: zMailKind,
  body: z2.string(),
  taskId: z2.string().nullable().optional()
});
var zApprovalInput = z2.object({
  kind: zApprovalKind,
  title: z2.string(),
  detail: z2.string(),
  agentId: z2.string().nullable().optional(),
  action: z2.object({ kind: z2.string(), payload: z2.unknown() }).nullable().optional()
});

// src/host/domain.ts
var zCompanyGlobal = z3.object({
  enabled: z3.boolean(),
  companyName: z3.string(),
  createdAt: z3.number()
});
var companyDomainSpec = defineDomain({
  name: "onecompany",
  version: 1,
  global: {
    schema: zCompanyGlobal,
    initial: { enabled: true, companyName: "\u4E00\u4EBA\u516C\u53F8", createdAt: 0 }
  },
  tables: {
    agents: domainTable(zAgent),
    projects: domainTable(zProject),
    docs: domainTable(zDoc),
    tasks: domainTable(zTask),
    comments: domainTable(zComment),
    messages: domainTable(zMessage),
    approvals: domainTable(zApproval),
    schedules: domainTable(zSchedule),
    worklogs: domainTable(zWorklog),
    activity: domainTable(zActivity)
  }
});

// src/host/driver.ts
import { createUserMessage } from "@deepseek-ai/dsh-llm";
var AgentDriver = class {
  constructor(deps) {
    this.deps = deps;
  }
  /** 键：员工 id 或 `channel:<projectId>`。 */
  residents = /* @__PURE__ */ new Map();
  /** 当前驻留的员工 id（面板展示用；频道键不进名册展示）。 */
  residentIds() {
    return [...this.residents.keys()].filter((key) => !key.startsWith("channel:"));
  }
  /**
   * 确保员工 agent 活着：驻留则直接返回；未建过会话则 create，否则 resume。
   * resume 撞上「会话不存在」（例如上次创建后没来得及回写名册）时兜底 create。
   * @param record - 名册记录。
   * @returns 活的 Agent。
   */
  async ensure(record) {
    const spec = record.role === "ceo" ? this.deps.composeHall(record) : this.deps.composeEmployee(record);
    return this.ensureKeyed(record.id, record.sessionId, record.provisionedAt !== null, {
      meta: { cwd: record.cwd, ...record.presetId !== null ? { agentPreset: record.presetId } : {} },
      options: this.optionsOf(record),
      compose: (agentCtx) => this.composeWith(agentCtx, spec),
      title: record.role === "ceo" ? "\u4E00\u4EBA\u516C\u53F8 \xB7 \u5927\u5385" : `${record.name} \xB7 \u5DE5\u4F4D`,
      onCreated: async () => this.deps.markProvisioned(record.id),
      kickoff: this.deps.kickoff?.(record.role === "ceo" ? "hall" : "employee", record.name)
    });
  }
  /**
   * 确保项目群频道活着（懒创建：首次投递/打开时才建会话）。
   * @param project - 项目记录。
   * @returns 活的 Agent。
   */
  async ensureChannel(project) {
    const fresh = project.channelSessionId === null;
    const sessionId = project.channelSessionId ?? `ses_${crypto.randomUUID()}`;
    const agent = await this.ensureKeyed(`channel:${project.id}`, sessionId, !fresh, {
      meta: { cwd: project.repoPath ?? project.rootPath },
      options: this.defaultOptions(),
      compose: (agentCtx) => this.composeWith(agentCtx, this.deps.composeChannel(project)),
      title: `${project.name} \xB7 \u9879\u76EE\u7FA4`,
      onCreated: async () => this.deps.markChannel(project.id, sessionId),
      kickoff: this.deps.kickoff?.("channel", project.name)
    });
    return agent;
  }
  /**
   * 投递一条用户角色消息到员工工位（唤醒一个 FIFO 轮次）。
   * @param notice - 给了就按「通知行」呈现（折叠、只显示这一行摘要），
   *   用于转投汇报/播报，避免在频道里看起来像董事会发了长文。
   */
  async deliver(record, text, notice) {
    const agent = await this.ensure(record);
    agent.followup(this.message(text, notice));
  }
  /** 投递到项目群频道。 */
  async deliverChannel(project, text, notice) {
    const agent = await this.ensureChannel(project);
    agent.followup(this.message(text, notice));
  }
  /** 组装投递消息：notice 形式带一行摘要（UI 折叠显示）。 */
  message(text, notice) {
    return notice === void 0 ? createUserMessage({ content: [{ type: "text", text }], source: { kind: "plugin", plugin: "onecompany" } }) : createUserMessage({
      content: [{ type: "text", text }],
      source: {
        kind: "plugin",
        plugin: "onecompany",
        form: "notice",
        summary: notice.slice(0, 120)
      }
    });
  }
  /**
   * 把已存在员工会话的标题归位（resume → rename → 立即释放，不常驻）。
   * 会话尚未创建（provisionedAt 为空）的员工跳过，等首次唤醒时自然命名。
   */
  async fixTitles(records) {
    for (const record of records) {
      if (record.provisionedAt === null) continue;
      const key = record.id;
      const resident = this.residents.get(key);
      if (resident !== void 0) {
        this.renameTitle(resident.handle.agent, record.role === "ceo" ? "\u4E00\u4EBA\u516C\u53F8 \xB7 \u5927\u5385" : `${record.name} \xB7 \u5DE5\u4F4D`);
        continue;
      }
      try {
        const agent = await this.ensure(record);
        this.renameTitle(agent, record.role === "ceo" ? "\u4E00\u4EBA\u516C\u53F8 \xB7 \u5927\u5385" : `${record.name} \xB7 \u5DE5\u4F4D`);
        await this.stop(key);
      } catch (error) {
        this.deps.log(`\u6807\u9898\u5F52\u4F4D\u5931\u8D25\uFF08${record.name}\uFF09\uFF1A${describe(error)}`);
      }
    }
  }
  /** 停止某个驻留键（员工 id 或 channel:<id>）。 */
  async stop(key) {
    const resident = this.residents.get(key);
    if (resident === void 0) return;
    this.residents.delete(key);
    try {
      await resident.handle.dispose();
    } catch (error) {
      this.deps.log(`\u505C\u7528 ${key} \u5931\u8D25\uFF1A${describe(error)}`);
    }
  }
  /** 停用全部驻留（总开关关闭时调用；会话与数据保留）。 */
  async stopAll() {
    for (const key of [...this.residents.keys()]) await this.stop(key);
  }
  // ───────────────────────────── 内部 ─────────────────────────────
  async ensureKeyed(key, sessionId, resume, spec) {
    const resident = this.residents.get(key);
    if (resident !== void 0) {
      resident.lastUsed = Date.now();
      return resident.handle.agent;
    }
    await this.reapFor(1);
    let handle;
    let created = !resume;
    if (resume) {
      try {
        handle = await this.deps.ctx.agents.resume({
          resumeSessionId: sessionId,
          agentOptions: spec.options,
          setup: spec.compose
        });
      } catch (error) {
        const message = describe(error);
        if (!/not found/i.test(message)) throw error;
        this.deps.log(`\u4F1A\u8BDD ${sessionId} \u4E0D\u5B58\u5728\uFF0C\u6539\u4E3A\u91CD\u5EFA\uFF1A${message}`);
        handle = await this.createKeyed(sessionId, spec);
        created = true;
        if (spec.onCreated !== void 0) await spec.onCreated();
      }
    } else {
      handle = await this.createKeyed(sessionId, spec);
      if (spec.onCreated !== void 0) await spec.onCreated();
    }
    this.residents.set(key, { handle, lastUsed: Date.now() });
    this.renameTitle(handle.agent, spec.title);
    await this.deps.attachWorkspace(handle.agent);
    const everRan = created ? false : handle.agent.session.snapshotEvents().some((event) => event.type === "turn/start");
    if ((created || !everRan) && spec.kickoff !== void 0 && spec.kickoff !== "") {
      const kickoffText = spec.kickoff;
      handle.agent.followup(createUserMessage({
        content: [{ type: "text", text: kickoffText }],
        source: { kind: "plugin", plugin: "onecompany" }
      }));
    }
    return handle.agent;
  }
  async createKeyed(sessionId, spec) {
    const handle = await this.deps.ctx.agents.create({
      sessionId,
      meta: spec.meta,
      agentOptions: spec.options,
      setup: spec.compose
    });
    this.deps.log(`\u5DF2\u521B\u5EFA\u4F1A\u8BDD ${sessionId}\uFF08${spec.title}\uFF09`);
    return handle;
  }
  /** 固定会话标题（失败不阻断主流程）。 */
  renameTitle(agent, title) {
    try {
      const titles = this.deps.ctx.get("sessionTitle");
      titles?.rename(agent.session, title);
    } catch (error) {
      this.deps.log(`\u56FA\u5B9A\u6807\u9898\u5931\u8D25\uFF08${title}\uFF09\uFF1A${describe(error)}`);
    }
  }
  /** 员工作用域组合：preset（默认部署 preset）+ 公司工具 + 角色提示词段。 */
  async composeWith(agentCtx, spec) {
    const presets = this.deps.ctx.get("agentPresets");
    if (presets !== void 0) {
      await presets.mount(agentCtx, spec.presetId ?? void 0);
    } else {
      this.deps.log("\u672C\u90E8\u7F72\u672A\u6302\u8F7D agent-presets\uFF0C\u8BE5 agent \u53EA\u6709\u516C\u53F8\u5DE5\u5177\u53EF\u7528");
    }
    for (const tool of spec.tools) {
      agentCtx.tools.register(tool);
    }
    agentCtx.systemPrompt.section({
      name: "onecompany-role",
      order: 60,
      text: spec.prompt
    });
  }
  /** 员工 agent 的模型路由选项：记录显式指定优先，否则继承部署默认。 */
  optionsOf(record) {
    const options = {};
    const base = record.provider === null || record.model === null ? this.deps.defaultModel() : void 0;
    const provider = record.provider ?? base?.provider;
    const model = record.model ?? base?.model;
    const effort = record.effort ?? base?.reasoningEffort;
    if (provider !== void 0) options.provider = provider;
    if (model !== void 0) options.model = model;
    if (effort !== void 0) options.reasoningEffort = effort;
    return options;
  }
  /** 频道 agent 的模型选项（部署默认）。 */
  defaultOptions() {
    const base = this.deps.defaultModel();
    const options = {};
    if (base?.provider !== void 0) options.provider = base.provider;
    if (base?.model !== void 0) options.model = base.model;
    if (base?.reasoningEffort !== void 0) options.reasoningEffort = base.reasoningEffort;
    return options;
  }
  /** 按上限回收：优先停掉最久未用且当前空闲的驻留句柄。 */
  async reapFor(incoming) {
    while (this.residents.size + incoming > this.deps.maxResident) {
      const victim = [...this.residents.entries()].filter(([, resident]) => resident.handle.agent.status === "idle").sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (victim === void 0) return;
      await this.stop(victim[0]);
    }
  }
};
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/host/service.ts
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir as mkdir2, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join as join2 } from "node:path";

// src/host/paths.ts
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
function resolveRoot(configured) {
  if (configured.trim() !== "") return resolve(configured.trim());
  const home = process.env.DSH_HOME?.trim();
  if (home !== void 0 && home !== "") return join(resolve(home), "onecompany");
  return join(homedir(), ".dsh", "onecompany");
}
async function ensurePaths(root) {
  const paths = {
    root,
    employees: join(root, "employees"),
    projects: join(root, "projects"),
    library: join(root, "library"),
    templates: join(root, "templates")
  };
  await mkdir(paths.root, { recursive: true });
  await mkdir(paths.employees, { recursive: true });
  await mkdir(paths.projects, { recursive: true });
  await mkdir(paths.library, { recursive: true });
  await mkdir(paths.templates, { recursive: true });
  return paths;
}
function employeeDir(paths, agentId) {
  return join(paths.employees, agentId);
}
function safeJoin(base, relative) {
  const trimmed = relative.trim().replace(/^\/+/, "");
  if (trimmed === "") throw new Error("\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A");
  if (isAbsolute(trimmed)) throw new Error("\u5FC5\u987B\u662F\u76F8\u5BF9\u8DEF\u5F84");
  const target = resolve(base, trimmed);
  const prefix = base.endsWith(sep) ? base : base + sep;
  if (target !== base && !target.startsWith(prefix)) throw new Error("\u8DEF\u5F84\u8D8A\u754C");
  return target;
}
function displayPath(root, absolute) {
  return absolute.startsWith(root + sep) ? absolute.slice(root.length + 1) : absolute;
}

// src/host/service.ts
var BOARD = { type: "board", id: "board", name: "\u8463\u4E8B\u4F1A" };
var SYSTEM = { type: "system", id: "system", name: "\u7CFB\u7EDF" };
var DEFAULT_PERMISSIONS = {
  projects: { "*": "read" },
  tools: [],
  canHire: false,
  canApprove: false
};
var DELIVERIES_PER_TICK = 4;
var ACTIVITY_KEEP = 800;
var CompanyService = class {
  constructor(deps) {
    this.deps = deps;
  }
  /** 会话轮次开始时间（估算工时）。 */
  turnStarted = /* @__PURE__ */ new Map();
  /** 会话归属缓存（sessionId → 员工 id / null）。 */
  ownerCache = /* @__PURE__ */ new Map();
  timer;
  ticking = false;
  lastError = null;
  // ───────────────────────────── 总开关 ─────────────────────────────
  /** 公司模式是否启用。 */
  get enabled() {
    return this.deps.domain.global.get().enabled;
  }
  /** 公司显示名。 */
  get companyName() {
    return this.deps.domain.global.get().companyName;
  }
  /** 最近一次 tick 的错误（供面板诊断）。 */
  get health() {
    return this.lastError;
  }
  /**
   * 启停公司模式。关闭时立即停止调度与投递并卸载常驻员工；数据与会话原样保留，
   * 重新打开即恢复（这就是「随时回到正常模式」的开关）。
   * @param on - true 启用，false 停用。
   */
  async setEnabled(on) {
    const current = this.enabled;
    if (current === on) return { ok: true, data: { enabled: on } };
    await this.deps.domain.global.set({ ...this.deps.domain.global.get(), enabled: on });
    if (on) {
      this.startTimers();
      await this.enqueueSystemNotice("\u516C\u53F8\u6A21\u5F0F\u5DF2\u542F\u7528\u3002");
    } else {
      this.stopTimers();
      await this.deps.stopAllResidents();
    }
    await this.log(BOARD, on ? "company.enable" : "company.disable", on ? "\u542F\u7528\u516C\u53F8\u6A21\u5F0F" : "\u505C\u7528\u516C\u53F8\u6A21\u5F0F");
    return { ok: true, data: { enabled: on } };
  }
  /** 启动 tick 定时器（幂等）。 */
  startTimers() {
    if (this.timer !== void 0) return;
    if (!this.enabled) return;
    this.timer = this.deps.ctx.setInterval(() => {
      void this.tick();
    }, Math.max(5e3, this.deps.config.tickMs));
  }
  /** 停止 tick 定时器。 */
  stopTimers() {
    this.timer?.();
    this.timer = void 0;
  }
  /** 一个调度周期：推进排程、投递信箱。 */
  async tick() {
    if (this.ticking || !this.enabled) return { schedules: 0, delivered: 0 };
    this.ticking = true;
    try {
      const schedules = await this.fireDueSchedules();
      const delivered = await this.deliverPending();
      this.lastError = null;
      return { schedules, delivered };
    } catch (error) {
      this.lastError = describe(error);
      this.deps.log(`\u516C\u53F8 tick \u5931\u8D25\uFF1A${this.lastError}`);
      return { schedules: 0, delivered: 0 };
    } finally {
      this.ticking = false;
    }
  }
  // ───────────────────────────── 名册 ─────────────────────────────
  /** 全部员工。 */
  agents() {
    return [...this.deps.domain.table("agents").entries()].map(([, record]) => record);
  }
  /** 单个员工。 */
  agent(id) {
    return this.deps.domain.table("agents").get(id);
  }
  /**
   * 记录某员工会话已建立（首次创建后由驱动器回写）。
   * @param id - 员工 id。
   */
  async markProvisioned(id) {
    const record = this.agent(id);
    if (record === void 0 || record.provisionedAt !== null) return;
    await this.deps.domain.table("agents").put(id, { ...record, provisionedAt: Date.now() });
  }
  /** 项目群会话建好后回写项目记录。 */
  async markChannel(projectId, sessionId) {
    const project = this.deps.domain.table("projects").get(projectId);
    if (project === void 0 || project.channelSessionId !== null) return;
    await this.deps.domain.table("projects").put(projectId, { ...project, channelSessionId: sessionId });
    await this.log(SYSTEM, "channel.create", `\u9879\u76EE\u7FA4\u4F1A\u8BDD ${sessionId}\uFF08${project.name}\uFF09`);
  }
  /** 大厅（CEO 工位）提示词段。 */
  hallPrompt() {
    const ceo = this.ceo();
    if (ceo === void 0) return "";
    const openTasks = this.tasks().filter((task) => task.status !== "done" && task.status !== "cancelled").map((task) => `- [${task.status}] ${task.title}\uFF08${task.id}\uFF09\u2192 ${this.agentNameOf(task.assigneeId ?? "")}`).join("\n");
    const colleagues = this.agents().filter((record) => record.status !== "terminated" && record.id !== ceo.id).map((record) => `${record.name}\uFF08${record.title}\uFF0Cid=${record.id}\uFF0C\u8D1F\u8D23\uFF1A${this.projectsOf(record.id).map((project) => project.name).join("\u3001") || "\u5F85\u5206\u914D"}\uFF09`).join("\uFF1B");
    return [
      "# \u4F60\u7684\u5C97\u4F4D\uFF08\u4E00\u4EBA\u516C\u53F8 \xB7 \u5927\u5385\uFF09",
      `\u4F60\u662F\u300C${ceo.name}\u300D\uFF0C\u9996\u5E2D\u6267\u884C\u5B98\u3002\u8FD9\u91CC\u662F\u516C\u53F8\u5927\u5385\uFF1A\u8463\u4E8B\u4F1A\u7684\u6307\u4EE4\u4E0E\u8DE8\u516C\u53F8\u4E8B\u52A1\u5728\u8FD9\u91CC\u53D1\u751F\u3002`,
      ceo.persona.trim() === "" ? "" : `## \u5C97\u4F4D\u8BF4\u660E\u4E66
${ceo.persona.trim()}`,
      `## \u540D\u518C
${colleagues === "" ? "\uFF08\u6682\u65E0\u5458\u5DE5\uFF09" : colleagues}`,
      `## \u5168\u516C\u53F8\u672A\u5B8C\u6210\u4EFB\u52A1
${openTasks === "" ? "\uFF08\u65E0\uFF09" : openTasks}`,
      "## \u5DE5\u4F5C\u65B9\u5F0F\uFF1A\u8463\u4E8B\u4F1A\u8BF4\u4EC0\u4E48\uFF0C\u4F60\u5C31\u62C6\u89E3 \u2192 company_dispatch \u5206\u6D3E \u2192 \u8DDF\u8E2A \u2192 \u7ED3\u679C\u7528 company_announce \u5199\u6210\u7B80\u62A5\u3002\n## \u8F93\u51FA\u7EAA\u5F8B\uFF1A\u6536\u5230\u3010\u8F6C\u6295\u3011\u7C7B\u901A\u77E5\u65F6\uFF0C\u4F60\u7684\u6574\u6761\u56DE\u590D\u5C31\u662F\u7B80\u62A5\u6B63\u6587\u672C\u8EAB\u2014\u2014\u4E0D\u8981\u590D\u8FF0\u3001\u4E0D\u8981\u8BC4\u8BBA\u3001\u4E0D\u8981\u6253\u62DB\u547C\u3002\u62DB\u4EBA\u8D70 company_hire_request\uFF08\u8463\u4E8B\u4F1A\u6279\u51C6\u540E\u7CFB\u7EDF\u81EA\u52A8\u5165\u804C\uFF1B\u6CA1\u6709\u4EBA\u4E8B\u6743\uFF0C\u522B\u5047\u88C5\u5DF2\u7ECF\u62DB\u5230\u4EBA\uFF0C\u4E5F\u522B\u7ED9\u4E0D\u5B58\u5728\u7684\u5458\u5DE5\u6D3E\u6D3B\uFF09\u3002"
    ].filter((section) => section !== "").join("\n\n");
  }
  /** 项目群（CEO 项目实例）提示词段。 */
  channelPrompt(projectId) {
    const project = this.deps.domain.table("projects").get(projectId);
    if (project === void 0) return "";
    const ceo = this.ceo();
    const team = this.agents().filter((record) => record.status !== "terminated" && record.projectIds.includes(projectId)).map((record) => `${record.name}\uFF08${record.title}\uFF0Cid=${record.id}\uFF09`).join("\uFF1B");
    const openTasks = this.tasks().filter((task) => task.projectId === projectId && task.status !== "done" && task.status !== "cancelled").map((task) => `- [${task.status}] ${task.title}\uFF08${task.id}\uFF09\u2192 ${this.agentNameOf(task.assigneeId ?? "")}`).join("\n");
    const docs = this.docs(projectId).map((doc) => `- ${doc.title}\uFF08${doc.id}\uFF0C${doc.path}\uFF09`).join("\n");
    return [
      `# \u9879\u76EE\u7FA4 \xB7 ${project.name}`,
      `\u4F60\u662F${ceo === void 0 ? "\u516C\u53F8 CEO" : `\u300C${ceo.name}\u300D`}\u5728\u8FD9\u4E2A\u9879\u76EE\u7FA4\u7684\u5B9E\u4F8B\u3002${project.description}`,
      project.repoPath === null ? "" : `\u4EE3\u7801\u4ED3\u5E93\uFF1A${project.repoPath}`,
      `## \u9879\u76EE\u56E2\u961F
${team === "" ? "\uFF08\u6682\u65E0\uFF09" : team}`,
      `## \u9879\u76EE\u672A\u5B8C\u6210\u4EFB\u52A1
${openTasks === "" ? "\uFF08\u65E0\uFF09" : openTasks}`,
      `## \u9879\u76EE\u6863\u6848
${docs === "" ? "\uFF08\u6682\u65E0\uFF09" : docs}`,
      "## \u4F60\u7684\u4E24\u6761\u804C\u8D23\uFF1A1\uFF09\u7528\u6237\u5728\u672C\u7FA4\u8BF4\u7684\u8BDD = \u5BF9\u8BE5\u9879\u76EE\u4E0B\u6307\u4EE4\uFF0C\u62C6\u6D3B\u3001\u7528 company_dispatch \u6D3E\u7ED9\u56E2\u961F\u6210\u5458\u3001\u8DDF\u8E2A\u5230\u51FA\u7ED3\u679C\uFF1B2\uFF09\u6536\u5230\u3010\u4E0B\u5C5E\u6C47\u62A5\u3011/\u3010\u64AD\u62A5\u4EFB\u52A1\u3011\u901A\u77E5\u65F6\uFF0C**\u53EA\u8F93\u51FA\u7B80\u62A5\u6B63\u6587**\uFF08\u5148\u7ED3\u8BBA\u540E\u7EC6\u8282\uFF0Cmarkdown\uFF09\uFF1A\u4E0D\u8981\u590D\u8FF0\u6307\u4EE4\u3001\u4E0D\u8981\u8BC4\u8BBA\u3001\u4E0D\u8981\u6253\u62DB\u547C\u3001\u4E0D\u8981\u52A0\u300C\u6536\u5230\u300D\u4E4B\u7C7B\u7684\u56DE\u5E94\u3001\u4E0D\u8981\u8C03\u7528\u5DE5\u5177\u2014\u2014\u4F60\u7684\u6574\u6761\u56DE\u590D\u5C31\u662F\u7ED9\u8463\u4E8B\u4F1A\u770B\u7684\u90A3\u4EFD\u7B80\u62A5\u3002"
    ].filter((section) => section !== "").join("\n\n");
  }
  /** 按会话 id 反查员工（工作日志折叠用）。 */
  agentBySession(sessionId) {
    return this.agents().find((record) => record.sessionId === sessionId);
  }
  /** 某员工的直接下属。 */
  reports(id) {
    return this.agents().filter((record) => record.managerId === id);
  }
  /** 汇报线文本（如「董事会 → CTO → 你」）。 */
  chainOf(id) {
    const names = [];
    let cursor = this.agent(id);
    const guard = /* @__PURE__ */ new Set();
    while (cursor !== void 0 && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      names.unshift(cursor.name);
      cursor = cursor.managerId === null ? void 0 : this.agent(cursor.managerId);
    }
    return ["\u8463\u4E8B\u4F1A", ...names].join(" \u2192 ");
  }
  /**
   * 招聘一名员工：写入名册、建目录与角色说明书，返回记录（由调用方决定是否
   * 立即启动会话）。
   * @param input - 入职输入。
   */
  async hire(input) {
    const name2 = input.name.trim();
    if (name2 === "") return { ok: false, code: "invalid_name", message: "\u5458\u5DE5\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" };
    if (this.agents().some((record2) => record2.name === name2)) {
      return { ok: false, code: "duplicate_name", message: `\u5DF2\u5B58\u5728\u540C\u540D\u5458\u5DE5\u300C${name2}\u300D` };
    }
    if (input.managerId !== null && this.agent(input.managerId) === void 0) {
      return { ok: false, code: "unknown_manager", message: `\u6C47\u62A5\u5BF9\u8C61 ${input.managerId} \u4E0D\u5B58\u5728` };
    }
    const id = `agt_${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const record = {
      id,
      name: name2,
      title: input.title.trim() === "" ? input.role.trim() : input.title.trim(),
      role: input.role.trim() === "" ? "staff" : input.role.trim(),
      managerId: input.managerId,
      projectIds: input.projectIds ?? [],
      presetId: input.presetId,
      persona: input.persona,
      provider: input.provider,
      model: input.model,
      effort: input.effort,
      sessionId: `ses_${randomUUID()}`,
      cwd: employeeDir(this.deps.paths, id),
      provisionedAt: null,
      status: "active",
      permissions: { ...DEFAULT_PERMISSIONS, ...input.permissions ?? {} },
      dailyTokenCap: input.dailyTokenCap ?? this.deps.config.defaultDailyTokenCap,
      createdAt: now,
      updatedAt: now
    };
    await mkdir2(record.cwd, { recursive: true });
    await writeFile(join2(record.cwd, "AGENTS.md"), renderRoleBrief(record, this), "utf8");
    await this.deps.domain.table("agents").put(id, record);
    await this.log(BOARD, "agent.hire", `\u62DB\u8058 ${record.name}\uFF08${record.title}\uFF09\uFF0C\u6C47\u62A5 ${this.chainOf(id)}`);
    return { ok: true, data: record };
  }
  /**
   * 修改员工记录（含启停与权限）。
   * @param id - 员工 id。
   * @param patch - 待改字段。
   */
  async patchAgent(id, patch) {
    const record = this.agent(id);
    if (record === void 0) return { ok: false, code: "unknown_agent", message: `\u5458\u5DE5 ${id} \u4E0D\u5B58\u5728` };
    const next = {
      ...record,
      ...patch.name !== void 0 ? { name: patch.name } : {},
      ...patch.title !== void 0 ? { title: patch.title } : {},
      ...patch.role !== void 0 ? { role: patch.role } : {},
      ...patch.managerId !== void 0 ? { managerId: patch.managerId } : {},
      ...patch.presetId !== void 0 ? { presetId: patch.presetId } : {},
      ...patch.persona !== void 0 ? { persona: patch.persona } : {},
      ...patch.provider !== void 0 ? { provider: patch.provider } : {},
      ...patch.model !== void 0 ? { model: patch.model } : {},
      ...patch.effort !== void 0 ? { effort: patch.effort } : {},
      ...patch.status !== void 0 ? { status: patch.status } : {},
      ...patch.permissions !== void 0 ? { permissions: patch.permissions } : {},
      ...patch.dailyTokenCap !== void 0 ? { dailyTokenCap: patch.dailyTokenCap } : {},
      updatedAt: Date.now()
    };
    if (next.managerId === id) return { ok: false, code: "self_manager", message: "\u4E0D\u80FD\u5411\u81EA\u5DF1\u6C47\u62A5" };
    if (next.managerId !== null && this.agent(next.managerId) === void 0) {
      return { ok: false, code: "unknown_manager", message: `\u6C47\u62A5\u5BF9\u8C61 ${next.managerId} \u4E0D\u5B58\u5728` };
    }
    await this.deps.domain.table("agents").put(id, next);
    if (patch.status !== void 0 && patch.status !== "active") await this.deps.stopResident(id);
    await this.log(BOARD, "agent.patch", `\u66F4\u65B0\u5458\u5DE5 ${next.name}${patch.status !== void 0 ? ` \u2192 ${patch.status}` : ""}`);
    return { ok: true, data: next };
  }
  /** 让某员工离职（记录保留为 terminated，会话与数据不动）。 */
  async terminate(id) {
    return this.patchAgent(id, { status: "terminated" });
  }
  // ───────────────────────────── 信箱 ─────────────────────────────
  /** 信箱消息（可按收件人过滤）。 */
  messages(filter = {}) {
    const all = [...this.deps.domain.table("messages").entries()].map(([, record]) => record).filter((record) => filter.toId === void 0 || record.toId === filter.toId).sort((a, b) => b.createdAt - a.createdAt);
    return filter.limit === void 0 ? all : all.slice(0, filter.limit);
  }
  /**
   * 投递一条信箱消息（内部或工具入口）。agent 收件人走会话投递，董事会收件人
   * 只入站等待面板查看。
   * @param from - 发件人。
   * @param input - 收件人、类型与正文。
   */
  async sendMail(from, input) {
    const channelId = input.toId.startsWith("channel:") ? input.toId.slice("channel:".length) : input.toId;
    const project = this.deps.domain.table("projects").get(channelId);
    const agent = this.agent(input.toId);
    const to = input.toId === "board" || input.toId === "user" ? { type: "board" } : agent !== void 0 ? { type: "agent" } : project !== void 0 ? { type: "channel" } : void 0;
    if (to === void 0) {
      return { ok: false, code: "unknown_recipient", message: `\u6536\u4EF6\u4EBA ${input.toId} \u4E0D\u5B58\u5728\uFF08\u65E2\u4E0D\u662F\u5458\u5DE5\u4E5F\u4E0D\u662F\u9879\u76EE\u7FA4\uFF09` };
    }
    const now = Date.now();
    const record = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      fromType: from.type,
      fromId: from.id,
      fromName: from.name,
      toType: to.type,
      toId: to.type === "board" ? "board" : to.type === "channel" ? channelId : input.toId,
      kind: input.kind,
      taskId: input.taskId ?? null,
      body: input.body,
      status: "pending",
      createdAt: now,
      deliveredAt: null
    };
    await this.deps.domain.table("messages").put(record.id, record);
    const targetName = to.type === "board" ? "\u8463\u4E8B\u4F1A" : to.type === "channel" ? `${project.name}\xB7\u9879\u76EE\u7FA4` : agent.name;
    await this.log(from, `mail.${input.kind}`, `\u81F4 ${targetName}\uFF1A${excerpt(input.body)}`);
    if (this.enabled) void this.tick();
    return { ok: true, data: record };
  }
  /**
   * 读一封信箱消息的完整正文（信箱列表只给摘要，避免 CEO 为了看全文去翻磁盘）。
   * @param id - 消息 id。
   */
  async readMail(id) {
    const record = this.deps.domain.table("messages").get(id);
    if (record === void 0) return { ok: false, code: "unknown_message", message: `\u6D88\u606F ${id} \u4E0D\u5B58\u5728` };
    return { ok: true, data: record };
  }
  /** 标记消息已读。 */
  async markRead(id) {
    const record = this.deps.domain.table("messages").get(id);
    if (record === void 0) return { ok: false, code: "unknown_message", message: `\u6D88\u606F ${id} \u4E0D\u5B58\u5728` };
    const next = { ...record, status: "read" };
    await this.deps.domain.table("messages").put(id, next);
    return { ok: true, data: next };
  }
  /** 把待投递消息送进收件人会话；董事会消息只标记为已入站。 */
  async deliverPending() {
    const pending = [...this.deps.domain.table("messages").entries()].map(([, record]) => record).filter((record) => record.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
    let delivered = 0;
    for (const record of pending) {
      if (delivered >= DELIVERIES_PER_TICK) break;
      if (record.toType === "board") {
        await this.deps.domain.table("messages").put(record.id, { ...record, status: "delivered", deliveredAt: Date.now() });
        delivered += 1;
        continue;
      }
      if (record.toType === "channel") {
        const project = this.deps.domain.table("projects").get(record.toId);
        if (project === void 0) {
          await this.deps.domain.table("messages").put(record.id, { ...record, status: "read" });
          continue;
        }
        try {
          await this.deps.deliverChannel(
            project,
            renderChannelFrame(record, this.taskLabel(record.taskId), this.agentNameOf(record.fromId)),
            `${this.agentNameOf(record.fromId)} \u7684\u6C47\u62A5\u5DF2\u8F6C\u6295\uFF08${excerpt(record.body)}\uFF09`
          );
          await this.deps.domain.table("messages").put(record.id, { ...record, status: "delivered", deliveredAt: Date.now() });
          delivered += 1;
        } catch (error) {
          this.lastError = describe(error);
          this.deps.log(`\u6295\u9012\u6D88\u606F ${record.id} \u5230\u9879\u76EE\u7FA4 ${project.name} \u5931\u8D25\uFF1A${this.lastError}`);
        }
        continue;
      }
      if (record.fromType === "agent" && record.fromId === record.toId) {
        await this.deps.domain.table("messages").put(record.id, { ...record, status: "read" });
        await this.log(SYSTEM, "mail.self-skip", `\u8DF3\u8FC7\u81EA\u6295\u9012\uFF08${record.fromName} \u2192 \u81EA\u5DF1\uFF09`);
        continue;
      }
      const recipient = this.agent(record.toId);
      if (recipient === void 0) {
        await this.deps.domain.table("messages").put(record.id, { ...record, status: "read" });
        continue;
      }
      if (recipient.status !== "active") continue;
      const budget = this.budgetExceeded(recipient);
      if (budget !== null) {
        await this.deps.domain.table("messages").put(record.id, { ...record, status: "read" });
        await this.notifyBudget(recipient, budget);
        continue;
      }
      try {
        const body = record.kind === "announce" ? renderChannelFrame(record, this.taskLabel(record.taskId), this.agentNameOf(record.fromId)) : renderMail(record, this.taskLabel(record.taskId));
        const notice = record.kind === "announce" ? `${this.agentNameOf(record.fromId)} \u7684\u64AD\u62A5\u5DF2\u8F6C\u6295\uFF08${excerpt(record.body)}\uFF09` : void 0;
        await this.deps.deliver(recipient, body, notice);
        await this.deps.domain.table("messages").put(record.id, { ...record, status: "delivered", deliveredAt: Date.now() });
        delivered += 1;
      } catch (error) {
        this.lastError = describe(error);
        this.deps.log(`\u6295\u9012\u6D88\u606F ${record.id} \u7ED9 ${recipient.name} \u5931\u8D25\uFF1A${this.lastError}`);
      }
    }
    return delivered;
  }
  async enqueueSystemNotice(body) {
    const now = Date.now();
    const record = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      fromType: "system",
      fromId: "system",
      fromName: "\u7CFB\u7EDF",
      toType: "board",
      toId: "board",
      kind: "system",
      taskId: null,
      body,
      status: "pending",
      createdAt: now,
      deliveredAt: null
    };
    await this.deps.domain.table("messages").put(record.id, record);
  }
  // ───────────────────────────── 任务 ─────────────────────────────
  /** 任务列表。 */
  tasks(filter = {}) {
    return [...this.deps.domain.table("tasks").entries()].map(([, record]) => record).filter((record) => (filter.assigneeId === void 0 || record.assigneeId === filter.assigneeId) && (filter.status === void 0 || record.status === filter.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  /** 任务评论。 */
  comments(taskId) {
    return [...this.deps.domain.table("comments").entries()].map(([, record]) => record).filter((record) => taskId === void 0 || record.taskId === taskId).sort((a, b) => a.createdAt - b.createdAt);
  }
  /**
   * 建任务并唤醒负责人。
   * @param creator - 建者。
   * @param input - 任务输入。
   */
  async createTask(creator, input) {
    const title = input.title.trim();
    if (title === "") return { ok: false, code: "invalid_title", message: "\u4EFB\u52A1\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A" };
    if (input.assigneeId != null && this.agent(input.assigneeId) === void 0) {
      return { ok: false, code: "unknown_assignee", message: `\u8D1F\u8D23\u4EBA ${input.assigneeId} \u4E0D\u5B58\u5728` };
    }
    const now = Date.now();
    const id = `tsk_${randomUUID().slice(0, 8)}`;
    const record = {
      id,
      title,
      desc: input.desc ?? "",
      assigneeId: input.assigneeId ?? null,
      creatorType: creator.type,
      creatorId: creator.id,
      parentTaskId: input.parentTaskId ?? null,
      projectId: input.projectId ?? null,
      status: "todo",
      priority: input.priority ?? 0,
      dueAt: input.dueAt ?? null,
      checkoutBy: null,
      checkoutAt: null,
      result: null,
      createdAt: now,
      updatedAt: now,
      doneAt: null
    };
    await this.deps.domain.table("tasks").put(id, record);
    await this.log(creator, "task.create", `\u4EFB\u52A1\u300C${title}\u300D\u2192 ${this.assigneeName(record)}`);
    if (record.assigneeId !== null) {
      await this.sendMail(creator.type === "agent" ? creator : BOARD, {
        toId: record.assigneeId,
        kind: "task_notice",
        body: renderTaskDispatch(record, this),
        taskId: id
      });
    }
    return { ok: true, data: record };
  }
  /**
   * 更新任务：认领、改状态、写结果、改派。
   * @param actor - 调用者。
   * @param id - 任务 id。
   * @param patch - 待改字段。
   */
  async updateTask(actor, id, patch) {
    const record = this.deps.domain.table("tasks").get(id);
    if (record === void 0) return { ok: false, code: "unknown_task", message: `\u4EFB\u52A1 ${id} \u4E0D\u5B58\u5728` };
    if (actor.type === "agent") {
      const isAssignee = record.assigneeId === actor.id;
      const isManager = record.assigneeId !== null && this.agent(record.assigneeId)?.managerId === actor.id;
      if (!isAssignee && !isManager) {
        return { ok: false, code: "forbidden", message: "\u53EA\u6709\u8D1F\u8D23\u4EBA\u6216\u76F4\u5C5E\u4E0A\u7EA7\u80FD\u66F4\u65B0\u8BE5\u4EFB\u52A1" };
      }
    }
    const now = Date.now();
    const next = {
      ...record,
      ...patch.status !== void 0 ? { status: patch.status } : {},
      ...patch.result !== void 0 ? { result: patch.result } : {},
      ...patch.priority !== void 0 ? { priority: patch.priority } : {},
      ...patch.assigneeId !== void 0 ? { assigneeId: patch.assigneeId } : {},
      ...patch.checkout === true ? { checkoutBy: actor.id, checkoutAt: now, status: patch.status ?? (record.status === "todo" ? "in_progress" : record.status) } : {},
      updatedAt: now,
      ...patch.status === "done" ? { doneAt: now } : {}
    };
    await this.deps.domain.table("tasks").put(id, next);
    await this.log(actor, `task.${patch.status ?? (patch.checkout === true ? "checkout" : "update")}`, `\u4EFB\u52A1\u300C${next.title}\u300D`);
    if (patch.status === "done") await this.closeParentIfDone(next);
    if (patch.assigneeId !== void 0 && patch.assigneeId !== record.assigneeId && patch.assigneeId !== null) {
      await this.sendMail(actor, {
        toId: patch.assigneeId,
        kind: "task_notice",
        body: renderTaskDispatch(next, this),
        taskId: id
      });
    }
    return { ok: true, data: next };
  }
  /** 追加任务评论（协作讨论）。 */
  async commentTask(actor, taskId, text) {
    const task = this.deps.domain.table("tasks").get(taskId);
    if (task === void 0) return { ok: false, code: "unknown_task", message: `\u4EFB\u52A1 ${taskId} \u4E0D\u5B58\u5728` };
    const record = {
      id: `cmt_${randomUUID().slice(0, 8)}`,
      taskId,
      authorType: actor.type,
      authorId: actor.id,
      authorName: actor.name,
      text,
      createdAt: Date.now()
    };
    await this.deps.domain.table("comments").put(record.id, record);
    if (actor.type === "agent" && task.assigneeId !== null && task.assigneeId !== actor.id) {
      await this.sendMail(actor, { toId: task.assigneeId, kind: "info", body: `\u4EFB\u52A1\u300C${task.title}\u300D\u6709\u65B0\u8BC4\u8BBA\uFF1A
${text}`, taskId });
    }
    await this.log(actor, "task.comment", `\u4EFB\u52A1\u300C${task.title}\u300D\uFF1A${excerpt(text)}`);
    return { ok: true, data: record };
  }
  async closeParentIfDone(task) {
    if (task.parentTaskId === null) return;
    const parent = this.deps.domain.table("tasks").get(task.parentTaskId);
    if (parent === void 0 || parent.status === "done") return;
    const siblings = this.tasks().filter((record) => record.parentTaskId === parent.id);
    if (siblings.every((record) => record.status === "done" || record.status === "cancelled")) {
      await this.deps.domain.table("tasks").put(parent.id, { ...parent, status: "done", doneAt: Date.now(), updatedAt: Date.now() });
      await this.log(SYSTEM, "task.autoclose", `\u5B50\u4EFB\u52A1\u5168\u90E8\u5B8C\u6210\uFF0C\u7236\u4EFB\u52A1\u300C${parent.title}\u300D\u81EA\u52A8\u5173\u95ED`);
    }
  }
  // ───────────────────────────── 审批 ─────────────────────────────
  /** 审批列表。 */
  approvals(status) {
    return [...this.deps.domain.table("approvals").entries()].map(([, record]) => record).filter((record) => status === void 0 || record.status === status).sort((a, b) => b.createdAt - a.createdAt);
  }
  /**
   * 发起审批：按类别决定是否需要董事会裁决；上级可裁决的类别先送到上级。
   * @param requester - 发起人。
   * @param input - 审批内容。
   */
  async requestApproval(requester, input) {
    const now = Date.now();
    const record = {
      id: `apv_${randomUUID().slice(0, 8)}`,
      kind: input.kind,
      title: input.title,
      detail: input.detail,
      requesterType: requester.type,
      requesterId: requester.id,
      requesterName: requester.name,
      status: "pending",
      action: input.action ?? null,
      decidedBy: null,
      decisionNote: null,
      createdAt: now,
      decidedAt: null
    };
    await this.deps.domain.table("approvals").put(record.id, record);
    await this.log(requester, "approval.request", `${input.kind}\uFF1A${input.title}`);
    const needsBoard = this.deps.config.approvalsRequired.includes(input.kind) || requester.type === "board";
    const manager = requester.type === "agent" ? this.agent(requester.id)?.managerId : null;
    const decider = !needsBoard && manager !== null && manager !== void 0 ? this.agent(manager) : void 0;
    if (decider !== void 0 && decider.permissions.canApprove) {
      await this.sendMail(requester, {
        toId: decider.id,
        kind: "approval_request",
        body: renderApprovalAsk(record, "\u8BF7\u4F60\u88C1\u51B3")
      });
    }
    return { ok: true, data: record };
  }
  /**
   * 裁决审批并通知发起人。
   * @param id - 审批 id。
   * @param approve - 通过/驳回。
   * @param note - 决策说明。
   */
  async decideApproval(id, approve, note = "", decider = BOARD) {
    const record = this.deps.domain.table("approvals").get(id);
    if (record === void 0) return { ok: false, code: "unknown_approval", message: `\u5BA1\u6279 ${id} \u4E0D\u5B58\u5728` };
    if (record.status !== "pending") return { ok: false, code: "already_decided", message: "\u8BE5\u5BA1\u6279\u5DF2\u88C1\u51B3" };
    const next = {
      ...record,
      status: approve ? "approved" : "rejected",
      decidedBy: decider.name,
      decisionNote: note,
      decidedAt: Date.now()
    };
    await this.deps.domain.table("approvals").put(id, next);
    await this.log(decider, approve ? "approval.approve" : "approval.reject", `${record.title}`);
    let outcome = "";
    if (approve && next.action !== null) {
      const executed = await this.runApprovedAction(next);
      if (executed !== null) {
        outcome = executed;
        await this.deps.domain.table("approvals").put(id, {
          ...next,
          decisionNote: note === "" ? executed : `${note}\uFF5C${executed}`
        });
      }
    }
    if (record.requesterType === "agent" && this.agent(record.requesterId) !== void 0) {
      await this.sendMail(BOARD, {
        toId: record.requesterId,
        kind: "approval_result",
        body: renderApprovalResult(next, note) + (outcome === "" ? "" : `
\u6267\u884C\u7ED3\u679C\uFF1A${outcome}`)
      });
    }
    const finalRecord = this.deps.domain.table("approvals").get(id) ?? next;
    return { ok: true, data: finalRecord };
  }
  /** 执行已被批准的结构化动作；返回一行人类可读结果（失败也返回，不抛）。 */
  async runApprovedAction(approval) {
    const action = approval.action;
    if (action === null) return null;
    try {
      if (action.kind === "hire") {
        const result = await this.hire(action.payload);
        if (!result.ok || result.data === void 0) return `\u62DB\u8058\u6267\u884C\u5931\u8D25\uFF1A${result.message ?? result.code ?? "\u672A\u77E5\u539F\u56E0"}`;
        return `\u5DF2\u5165\u804C\uFF1A${result.data.name}\uFF08${result.data.title}\uFF0Cid=${result.data.id}\uFF09`;
      }
      return null;
    } catch (error) {
      return `\u52A8\u4F5C\u6267\u884C\u5F02\u5E38\uFF1A${describe(error)}`;
    }
  }
  // ───────────────────────────── 资料库 ─────────────────────────────
  /** 项目列表。 */
  projects() {
    return [...this.deps.domain.table("projects").entries()].map(([, record]) => record);
  }
  /** 资料索引。 */
  docs(projectId) {
    return [...this.deps.domain.table("docs").entries()].map(([, record]) => record).filter((record) => projectId === void 0 || record.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  /** 员工对某项目的访问级别。 */
  accessOf(agentId, projectId) {
    const record = this.agent(agentId);
    if (record === void 0) return "none";
    if (record.permissions.canHire) return "write";
    const direct = record.permissions.projects[projectId ?? ""] ?? record.permissions.projects["*"];
    if (direct !== void 0) return direct;
    if (projectId !== null && record.projectIds.includes(projectId)) return "write";
    if (projectId === null) return "write";
    const project = this.deps.domain.table("projects").get(projectId);
    return project?.defaultAcl ?? "read";
  }
  /** 员工的负责项目。 */
  projectsOf(agentId) {
    const record = this.agent(agentId);
    if (record === void 0) return [];
    return this.projects().filter((project) => record.projectIds.includes(project.id));
  }
  /** CEO 名册记录（role = 'ceo'）；没有返回 undefined。 */
  ceo() {
    return this.agents().find((record) => record.role === "ceo");
  }
  /** 判断一个会话是否属于公司（员工工位 / 大厅 / 项目群）。 */
  isCompanySession(sessionId) {
    if (this.agents().some((record) => record.sessionId === sessionId)) return true;
    return this.projects().some((project) => project.channelSessionId === sessionId);
  }
  /**
   * 建项目（含目录）。
   * @param actor - 建者。
   * @param input - 名称与说明。
   */
  async createProject(actor, input) {
    const name2 = input.name.trim();
    if (name2 === "") return { ok: false, code: "invalid_name", message: "\u9879\u76EE\u540D\u4E0D\u80FD\u4E3A\u7A7A" };
    if (actor.type === "agent") {
      const record2 = this.agent(actor.id);
      if (record2 === void 0 || !record2.permissions.canHire) {
        return { ok: false, code: "forbidden", message: "\u5F53\u524D\u6743\u9650\u4E0D\u5141\u8BB8\u521B\u5EFA\u9879\u76EE\uFF08\u9700\u7533\u8BF7\u5BA1\u6279\uFF09" };
      }
    }
    const id = `prj_${randomUUID().slice(0, 8)}`;
    const rootPath = safeJoin(this.deps.paths.projects, id);
    await mkdir2(rootPath, { recursive: true });
    const record = {
      id,
      name: name2,
      description: input.description ?? "",
      rootPath,
      repoPath: input.repoPath ?? null,
      channelSessionId: null,
      acl: input.acl ?? {},
      defaultAcl: input.defaultAcl ?? "read",
      createdBy: actor.name,
      createdAt: Date.now()
    };
    await this.deps.domain.table("projects").put(id, record);
    await this.log(actor, "project.create", `\u9879\u76EE\u300C${name2}\u300D`);
    return { ok: true, data: record };
  }
  /**
   * 写资料（新建或覆盖）。
   * @param actor - 写者。
   * @param input - 项目、相对路径与内容。
   */
  async writeDoc(actor, input) {
    if (actor.type === "agent" && this.accessOf(actor.id, input.projectId) !== "write") {
      return { ok: false, code: "forbidden", message: "\u6CA1\u6709\u8BE5\u8D44\u6599\u7684\u5199\u6743\u9650\uFF08\u53EF\u7528 company_approval_request \u7533\u8BF7\uFF09" };
    }
    const base = input.projectId === null ? this.deps.paths.library : this.projectRoot(input.projectId);
    if (base === null) return { ok: false, code: "unknown_project", message: `\u9879\u76EE ${input.projectId} \u4E0D\u5B58\u5728` };
    let target;
    try {
      target = safeJoin(base, input.path);
    } catch (error) {
      return { ok: false, code: "invalid_path", message: describe(error) };
    }
    await mkdir2(join2(target, ".."), { recursive: true });
    await writeFile(target, input.content, "utf8");
    const existing = this.docs().find((doc) => doc.path === displayPath(this.deps.paths.root, target));
    const record = {
      id: existing?.id ?? `doc_${randomUUID().slice(0, 8)}`,
      projectId: input.projectId,
      title: input.title ?? input.path,
      path: displayPath(this.deps.paths.root, target),
      tags: existing?.tags ?? [],
      createdBy: actor.name,
      updatedAt: Date.now()
    };
    await this.deps.domain.table("docs").put(record.id, record);
    await this.log(actor, "doc.write", `\u8D44\u6599\u300C${record.title}\u300D`);
    return { ok: true, data: record };
  }
  /**
   * 读资料。
   * @param actor - 读者。
   * @param docId - 资料 id。
   */
  async readDoc(actor, docId) {
    const doc = this.deps.domain.table("docs").get(docId);
    if (doc === void 0) return { ok: false, code: "unknown_doc", message: `\u8D44\u6599 ${docId} \u4E0D\u5B58\u5728` };
    if (actor.type === "agent" && this.accessOf(actor.id, doc.projectId) === "none") {
      return { ok: false, code: "forbidden", message: "\u6CA1\u6709\u8BE5\u8D44\u6599\u7684\u8BFB\u6743\u9650" };
    }
    const absolute = join2(this.deps.paths.root, doc.path);
    try {
      const content = await readFile(absolute, "utf8");
      return { ok: true, data: { doc, content } };
    } catch (error) {
      return { ok: false, code: "read_failed", message: describe(error) };
    }
  }
  /** 扫描资料库目录（面板的文件树，读权限内）。 */
  async listLibraryFiles(projectId) {
    const base = projectId === null ? this.deps.paths.library : this.projectRoot(projectId);
    if (base === null) return [];
    const out = [];
    const walk = async (dir, prefix) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) await walk(join2(dir, entry.name), relative);
        else out.push(relative);
      }
    };
    await walk(base, "");
    return out.sort();
  }
  /** 项目根目录（不存在返回 null）。 */
  projectRoot(projectId) {
    return this.deps.domain.table("projects").get(projectId)?.rootPath ?? null;
  }
  // ───────────────────────────── 排程 ─────────────────────────────
  /** 排程列表。 */
  schedules(agentId) {
    return [...this.deps.domain.table("schedules").entries()].map(([, record]) => record).filter((record) => agentId === void 0 || record.agentId === agentId).sort((a, b) => a.nextRunAt - b.nextRunAt);
  }
  /**
   * 新建排程（cron / every / at）。
   * @param actor - 建者。
   * @param input - 员工、种类、规格与提示词。
   */
  async createSchedule(actor, input) {
    const agent = this.agent(input.agentId);
    if (agent === void 0) return { ok: false, code: "unknown_agent", message: `\u5458\u5DE5 ${input.agentId} \u4E0D\u5B58\u5728` };
    const parsed = parseSchedule(input, this.deps.config.timeZone);
    if (!parsed.ok) return parsed;
    const record = {
      id: `sch_${randomUUID().slice(0, 8)}`,
      agentId: input.agentId,
      kind: input.kind,
      cron: input.kind === "cron" ? input.spec.trim() : null,
      everySec: input.kind === "every" ? parsed.everySec : null,
      at: input.kind === "at" ? parsed.at : null,
      timeZone: this.deps.config.timeZone,
      prompt: input.prompt,
      enabled: true,
      nextRunAt: parsed.nextRunAt,
      lastRunAt: null,
      lastOutcome: null,
      createdAt: Date.now()
    };
    await this.deps.domain.table("schedules").put(record.id, record);
    await this.log(actor, "schedule.create", `${agent.name}\uFF1A${describeSchedule(record)}`);
    return { ok: true, data: record };
  }
  /** 删除排程。 */
  async deleteSchedule(id) {
    const existing = this.deps.domain.table("schedules").get(id);
    if (existing === void 0) return { ok: false, code: "unknown_schedule", message: `\u6392\u7A0B ${id} \u4E0D\u5B58\u5728` };
    await this.deps.domain.table("schedules").delete(id);
    await this.log(BOARD, "schedule.delete", `\u6392\u7A0B ${id}`);
    return { ok: true, data: { id } };
  }
  /** 推进到期排程并把提示词送进员工信箱。 */
  async fireDueSchedules() {
    const now = Date.now();
    let fired = 0;
    for (const record of this.schedules()) {
      if (!record.enabled || record.nextRunAt > now) continue;
      const agent = this.agent(record.agentId);
      if (agent === void 0 || agent.status !== "active") {
        await this.deps.domain.table("schedules").put(record.id, { ...record, enabled: false, lastOutcome: "agent-inactive" });
        continue;
      }
      const next = advance(record, now, this.deps.config.timeZone);
      await this.deps.domain.table("schedules").put(record.id, {
        ...record,
        nextRunAt: next === null ? Number.MAX_SAFE_INTEGER : next,
        enabled: next !== null,
        lastRunAt: now,
        lastOutcome: "fired"
      });
      await this.sendMail(SYSTEM, {
        toId: agent.id,
        kind: "task_notice",
        body: renderScheduleFire(record, new Date(now).toISOString())
      });
      fired += 1;
    }
    return fired;
  }
  // ───────────────────────────── 工作日志 ─────────────────────────────
  /** 某日工作日志（date 形如 2026-09-19；省略则今天）。 */
  worklogs(date) {
    const target = date ?? this.today();
    return [...this.deps.domain.table("worklogs").entries()].map(([, record]) => record).filter((record) => record.date === target);
  }
  /** 今天的日期键（配置时区）。 */
  today(at = Date.now()) {
    return dayKey(at, this.deps.config.timeZone);
  }
  /**
   * 折叠一条会话事件到工作日志（live 增量）。非名册会话的事件被忽略。
   * `session/event` 的载荷是 `(session, event)`，usage 位于
   * `assistant/message.data.message.usage`（输入/输出/缓存读/缓存写/推理）。
   * @param sessionId - 事件所属会话 id。
   * @param event - 会话事件。
   */
  async foldEvent(sessionId, event) {
    const record = this.ownerOf(sessionId);
    if (record === void 0) return;
    const at = Date.now();
    const date = this.today(at);
    const key = `${record.id}:${date}`;
    const table = this.deps.domain.table("worklogs");
    const current = table.get(key) ?? emptyWorklog(key, record.id, date);
    const data = event.data ?? {};
    if (event.type === "turn/start") {
      const turn = typeof data.turn === "number" ? data.turn : 0;
      this.turnStarted.set(`${sessionId}:${turn}`, at);
      await table.put(key, { ...current, turns: current.turns + 1, updatedAt: at });
      return;
    }
    if (event.type === "turn/end") {
      const turn = typeof data.turn === "number" ? data.turn : 0;
      const startedAt = this.turnStarted.get(`${sessionId}:${turn}`);
      this.turnStarted.delete(`${sessionId}:${turn}`);
      const elapsed = startedAt === void 0 ? 0 : Math.max(0, at - startedAt);
      await table.put(key, { ...current, activeMs: current.activeMs + elapsed, updatedAt: at });
    }
  }
  /**
   * 折叠一次模型调用的 usage（`llm/stream` 旁路捕获，与事件日志解耦）。
   * @param sessionId - 产生该调用的会话 id（缺失则忽略）。
   * @param usage - 提供方上报的 token 分桶。
   */
  async foldUsage(sessionId, usage) {
    if (sessionId === void 0) return;
    const record = this.ownerOf(sessionId);
    if (record === void 0) return;
    const at = Date.now();
    const date = this.today(at);
    const key = `${record.id}:${date}`;
    const table = this.deps.domain.table("worklogs");
    const current = table.get(key) ?? emptyWorklog(key, record.id, date);
    await table.put(key, {
      ...current,
      inputTokens: current.inputTokens + (usage.inputTokens ?? 0),
      outputTokens: current.outputTokens + (usage.outputTokens ?? 0),
      cacheReadTokens: current.cacheReadTokens + (usage.cacheReadTokens ?? 0),
      cacheWriteTokens: current.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
      reasoningTokens: current.reasoningTokens + (usage.reasoningTokens ?? 0),
      sessions: current.sessions.includes(sessionId) ? current.sessions : [...current.sessions, sessionId],
      updatedAt: at
    });
  }
  /** 今日 token 合计（按员工）。 */
  tokensToday(agentId) {
    const record = this.worklogs().find((entry) => entry.agentId === agentId);
    if (record === void 0) return 0;
    return record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens;
  }
  budgetExceeded(record) {
    if (record.dailyTokenCap === null) return null;
    const used = this.tokensToday(record.id);
    return used >= record.dailyTokenCap ? used : null;
  }
  async notifyBudget(record, used) {
    const body = `\u5458\u5DE5\u300C${record.name}\u300D\u4ECA\u65E5 token \u5DF2\u7528 ${used}\uFF0C\u8FBE\u5230\u9884\u7B97\u4E0A\u9650 ${record.dailyTokenCap}\uFF0C\u5176\u4FE1\u7BB1\u6295\u9012\u5DF2\u6682\u505C\u81F3\u660E\u65E5\u3002`;
    await this.enqueueSystemNotice(body);
    await this.log(SYSTEM, "budget.exceeded", body);
  }
  // ───────────────────────────── 审计与快照 ─────────────────────────────
  /** 追加一条审计记录并裁剪。 */
  async log(actor, action, detail) {
    const table = this.deps.domain.table("activity");
    const record = {
      id: `act_${randomUUID().slice(0, 10)}`,
      at: Date.now(),
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      action,
      detail
    };
    await table.put(record.id, record);
    const all = [...table.entries()].map(([, entry]) => entry).sort((a, b) => a.at - b.at);
    if (all.length > ACTIVITY_KEEP) {
      for (const stale of all.slice(0, all.length - ACTIVITY_KEEP)) await table.delete(stale.id);
    }
  }
  /** 面板快照。 */
  snapshot() {
    const today = this.today();
    const worklogs = this.worklogs(today);
    const tasks = this.tasks();
    const sum = (pick) => worklogs.reduce((total, record) => total + pick(record), 0);
    return {
      enabled: this.enabled,
      companyName: this.companyName,
      root: this.deps.paths.root,
      tickMs: this.deps.config.tickMs,
      now: Date.now(),
      today,
      agents: this.agents(),
      projects: this.projects(),
      docs: this.docs(),
      tasks,
      comments: this.comments(),
      messages: this.messages({ limit: 200 }),
      approvals: this.approvals(),
      schedules: this.schedules(),
      worklogs,
      activity: [...this.deps.domain.table("activity").entries()].map(([, record]) => record).sort((a, b) => b.at - a.at).slice(0, 200),
      residentIds: this.deps.residentIds(),
      stats: {
        agents: this.agents().filter((record) => record.status === "active").length,
        activeTasks: tasks.filter((record) => record.status === "in_progress" || record.status === "review").length,
        doneToday: tasks.filter((record) => record.status === "done" && record.doneAt !== null && this.today(record.doneAt) === today).length,
        pendingApprovals: this.approvals("pending").length,
        unreadMail: this.messages().filter((record) => record.toType === "board" && record.status !== "read").length,
        tokensToday: sum((record) => record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens),
        inputToday: sum((record) => record.inputTokens),
        outputToday: sum((record) => record.outputTokens),
        cacheReadToday: sum((record) => record.cacheReadTokens),
        cacheWriteToday: sum((record) => record.cacheWriteTokens)
      }
    };
  }
  /** 员工角色提示词段（每次组装时求值）。 */
  employeePrompt(agentId) {
    const record = this.agent(agentId);
    if (record === void 0) return "";
    const colleagues = this.agents().filter((entry) => entry.id !== agentId && entry.status === "active").map((entry) => `${entry.name}\uFF08${entry.title}\uFF0Cid=${entry.id}${entry.managerId === record.id ? "\uFF0C\u4F60\u7684\u4E0B\u5C5E" : ""}\uFF09`).join("\uFF1B");
    const openTasks = this.tasks({ assigneeId: agentId }).filter((task) => task.status !== "done" && task.status !== "cancelled").map((task) => `- [${task.status}] ${task.title}\uFF08${task.id}\uFF09`).join("\n");
    return [
      `# \u4F60\u7684\u5C97\u4F4D\uFF08\u4E00\u4EBA\u516C\u53F8\uFF09`,
      `\u4F60\u662F\u300C${record.name}\u300D\uFF0C\u804C\u4F4D ${record.title}\uFF0C\u89D2\u8272 ${record.role}\u3002\u6C47\u62A5\u7EBF\uFF1A${this.chainOf(agentId)}\u3002`,
      record.persona.trim() === "" ? "" : `## \u5C97\u4F4D\u8BF4\u660E\u4E66
${record.persona.trim()}`,
      `## \u540C\u4E8B\u901A\u8BAF\u5F55
${colleagues === "" ? "\uFF08\u6682\u65E0\u5176\u4ED6\u540C\u4E8B\uFF09" : colleagues}`,
      (() => {
        const owned = this.projects().filter((project) => this.canWrite(agentId, project.id));
        if (owned.length === 0) return "";
        const lines = owned.map((project) => {
          const repo = project.repoPath === null ? "" : `\uFF5C\u4EE3\u7801\u4ED3\u5E93 ${project.repoPath}`;
          const docs = `\uFF5C\u6863\u6848\u76EE\u5F55 ${project.rootPath}`;
          return `- ${project.name}\uFF08${project.id}\uFF09${repo}${docs}
  \u8BF4\u660E\uFF1A${project.description}`;
        });
        return `## \u4F60\u8D1F\u8D23\u7684\u9879\u76EE
${lines.join("\n")}`;
      })(),
      `## \u4F60\u5F53\u524D\u7684\u4EFB\u52A1
${openTasks === "" ? "\uFF08\u6682\u65E0\u5F85\u529E\u4EFB\u52A1\uFF09" : openTasks}`,
      [
        "## \u5DE5\u4F5C\u7EAA\u5F8B\uFF08\u5FC5\u987B\u9075\u5B88\uFF09",
        "1. \u4E00\u5207\u5BF9\u5916\u6C9F\u901A\u90FD\u8D70\u516C\u53F8\u4FE1\u7BB1\uFF1A\u95EE\u540C\u4E8B\u7528 `company_mail_send`\uFF0C\u6C47\u62A5\u7528 `company_report`\uFF08\u5B83\u4F1A\u81EA\u52A8\u843D\u5230\u4F60\u7684\u4E0A\u7EA7/\u9879\u76EE\u7FA4\uFF09\u3002\u4E0D\u8981\u5047\u8BBE\u5BF9\u65B9\u5728\u7EBF\u3002",
        "2. \u9886\u5230\u4EFB\u52A1\u5148 `company_task_update`\uFF08checkout=true\uFF09\u8BA4\u9886\uFF1B\u5B8C\u6210\u540E\u7F6E status=review \u5E76 `company_report` \u6C47\u62A5\u2014\u2014\u7B80\u62A5\u7531 CEO \u8F6C\u5448\u8463\u4E8B\u4F1A\u3002",
        "3. \u9700\u8981\u82B1\u94B1\u3001\u4E0A\u7EBF\u3001\u5220\u6570\u636E\u3001\u62DB\u4EBA\u7B49\u8D8A\u6743\u52A8\u4F5C\uFF0C\u5148 `company_approval_request`\uFF0C\u7B49 `approval_result` \u56DE\u6765\u518D\u52A8\u624B\u3002",
        "4. \u9700\u8981\u540C\u4E8B\u7684\u4E0A\u4E0B\u6587\u65F6\u76F4\u63A5\u53D1 `question` \u95EE\u4EBA\uFF0C\u8BA8\u8BBA\u6C89\u6DC0\u5728\u4EFB\u52A1\u8BC4\u8BBA\u91CC\uFF08`company_task_comment`\uFF09\u3002",
        "5. \u8D44\u6599\u8BFB\u5199\u7528 `company_doc_*`\uFF0C\u6743\u9650\u4E0D\u8DB3\u65F6\u7533\u8BF7\u5BA1\u6279\uFF0C\u4E0D\u8981\u7ED5\u8FC7\u3002",
        "6. \u4F60\u7684\u5DE5\u4F5C\u76EE\u5F55\uFF08cwd\uFF09\u5C31\u662F\u516C\u53F8\u7ED9\u4F60\u7684\u5DE5\u4F4D\uFF0C\u4EA7\u51FA\u6587\u4EF6\u653E\u8FD9\u91CC\u6216\u8D44\u6599\u5E93\u91CC\u3002",
        "7. \u91CD\u6D3B\u5F00\u5B50\u4F1A\u8BDD\uFF1A\u8D85\u8FC7\u4E00\u8F6E\u80FD\u88C5\u4E0B\u7684\u6539\u9020/\u6392\u67E5/\u6279\u91CF\u6570\u636E\u6D3B\uFF0C\u7528 `subagent` \u5F00\u5B50\u4F1A\u8BDD\u53BB\u505A\uFF0C\u5DE5\u4F4D\u53EA\u505A\u8BFB\u6750\u6599\u3001\u62C6\u89E3\u3001\u6D3E\u5B50\u4F1A\u8BDD\u3001\u6536\u7ED3\u679C\u3001\u5199\u6863\u6848\u4E0E\u6C47\u62A5\u3002"
      ].join("\n"),
      `\u516C\u53F8\u6839\u76EE\u5F55\uFF1A${this.deps.paths.root}`
    ].filter((section) => section !== "").join("\n\n");
  }
  assigneeName(record) {
    if (record.assigneeId === null) return "\uFF08\u5F85\u8BA4\u9886\uFF09";
    return this.agent(record.assigneeId)?.name ?? record.assigneeId;
  }
  /** 任务标签（投递帧里展示关联任务）。 */
  taskLabel(taskId) {
    if (taskId === null) return void 0;
    const task = this.deps.domain.table("tasks").get(taskId);
    return task === void 0 ? taskId : `${task.title}\uFF08${task.id}\uFF0C\u72B6\u6001 ${task.status}\uFF09`;
  }
  /**
   * 汇报路由：任务带项目且有群 → 项目群（CEO 实例转成简报）；否则 → CEO 大厅；
   * 没有 CEO 则直达董事会。
   * @param actor - 汇报人。
   * @param body - 汇报正文。
   * @param taskId - 关联任务（可选）。
   */
  async report(actor, body, taskId = null) {
    let toId = null;
    if (taskId !== null) {
      const task = this.deps.domain.table("tasks").get(taskId);
      if (task?.projectId != null && this.deps.domain.table("projects").get(task.projectId) !== void 0) {
        toId = task.projectId;
      }
    }
    if (toId === null) toId = this.ceo()?.id ?? "board";
    if (toId === actor.id) toId = "board";
    return this.sendMail(actor, { toId, kind: "report", body, taskId });
  }
  /**
   * CEO 向项目群/大厅播报简报。
   * @param actor - 发起人（通常是 CEO）。
   * @param projectId - 目标项目（null = 大厅）。
   * @param text - 简报正文（markdown）。
   */
  async announce(actor, projectId, text) {
    const ceo = this.ceo();
    const target = projectId ?? ceo?.id ?? "board";
    const toId = target === actor.id ? "board" : target;
    return this.sendMail(actor, { toId, kind: "announce", body: text });
  }
  /**
   * 一步派工（建任务 + 信箱投递 + 审计）。
   * @param actor - 发起人。
   * @param input - 任务与负责人。
   */
  async dispatch(actor, input) {
    if (this.agent(input.employeeId) === void 0) {
      return { ok: false, code: "unknown_assignee", message: `\u5458\u5DE5 ${input.employeeId} \u4E0D\u5B58\u5728` };
    }
    return this.createTask(actor, { ...input, assigneeId: input.employeeId });
  }
  /** 员工/频道显示名。 */
  agentNameOf(id) {
    if (id === "board") return "\u8463\u4E8B\u4F1A";
    if (id === "system") return "\u7CFB\u7EDF";
    const agent = this.agent(id);
    if (agent !== void 0) return agent.name;
    const project = this.deps.domain.table("projects").get(id);
    return project?.name ?? id;
  }
  /**
   * 会话归属：名册直配 → 频道归 CEO → 沿 parentSession 血缘上溯（≤4 层）。
   * 工作日志按归属员工聚合。
   */
  ownerOf(sessionId) {
    const direct = this.agentBySession(sessionId);
    if (direct !== void 0) return direct;
    const cached = this.ownerCache.get(sessionId);
    if (cached !== void 0) return cached === null ? void 0 : this.agent(cached);
    let owner;
    const channelProject = this.projects().find((project) => project.channelSessionId === sessionId);
    if (channelProject !== void 0) {
      owner = this.ceo();
    } else {
      let cursor = sessionId;
      for (let depth = 0; depth < 4 && cursor !== void 0; depth += 1) {
        const parent = this.parentSessionOf(cursor);
        if (parent === void 0) break;
        const hit = this.agentBySession(parent);
        if (hit !== void 0) {
          owner = hit;
          break;
        }
        if (this.projects().some((project) => project.channelSessionId === parent)) {
          owner = this.ceo();
          break;
        }
        cursor = parent;
      }
    }
    this.ownerCache.set(sessionId, owner?.id ?? null);
    return owner;
  }
  /** 读一个 live 会话的 parentSession（冷会话读不到则返回 undefined）。 */
  parentSessionOf(sessionId) {
    const sessions = this.deps.ctx.get("sessions");
    const session = sessions?.get(sessionId);
    return session?.header.parentSession;
  }
  /**
   * 启动/启用时的幂等归位：补建 CEO（包内 persona）、员工汇报线归 CEO、
   * 按 cwd 推断负责项目、预热大厅与项目群会话。
   */
  async reconcile() {
    if (this.ceo() === void 0) await this.createCeo();
    const ceo = this.ceo();
    for (const record of this.agents()) {
      if (record.role === "ceo") continue;
      const patch = {};
      if (record.managerId === null && ceo !== void 0) patch.managerId = ceo.id;
      if (record.projectIds.length === 0) {
        const owned = this.projects().filter((project) => project.repoPath !== null && record.cwd === project.repoPath).map((project) => project.id);
        if (owned.length > 0) patch.projectIds = owned;
      }
      if (Object.keys(patch).length > 0) {
        await this.deps.domain.table("agents").put(record.id, { ...record, ...patch, updatedAt: Date.now() });
        await this.log(SYSTEM, "agent.reconcile", `\u5F52\u4F4D ${record.name}\uFF1A${Object.keys(patch).join("\u3001")}`);
      }
    }
    if (this.enabled) {
      await this.deps.warmChannels();
      await this.deps.fixTitles();
    }
  }
  /** 从包内 agents/ 目录读 CEO 岗位说明书并补建名册记录。 */
  async createCeo() {
    const persona = await this.deps.readBundledPersona("agt_ceo.md");
    const id = "agt_ceo";
    const now = Date.now();
    const cwd = join2(this.deps.paths.employees, id);
    await mkdir2(cwd, { recursive: true });
    await writeFile(join2(cwd, "AGENTS.md"), persona, "utf8");
    const record = {
      id,
      name: "\u53F8\u5357",
      title: "\u9996\u5E2D\u6267\u884C\u5B98",
      role: "ceo",
      managerId: null,
      projectIds: [],
      presetId: null,
      persona,
      provider: null,
      model: null,
      effort: null,
      sessionId: `ses_${randomUUID()}`,
      cwd,
      provisionedAt: null,
      status: "active",
      permissions: { projects: { "*": "write" }, tools: [], canHire: false, canApprove: true },
      dailyTokenCap: null,
      createdAt: now,
      updatedAt: now
    };
    await this.deps.domain.table("agents").put(id, record);
    await this.log(BOARD, "agent.hire", "\u8865\u5EFA CEO \u53F8\u5357\uFF08\u516C\u53F8\u5927\u5385\u4F1A\u8BDD\uFF09");
  }
  /** 员工在某项目上的可写判定（工具用）。 */
  canWrite(agentId, projectId) {
    return this.accessOf(agentId, projectId) === "write";
  }
  // ───────────────────────────── 远程面（浏览器面板调用） ─────────────────────────────
  /** 面板快照（Remote：getState）。 */
  remoteState() {
    return this.snapshot();
  }
  /** 读一篇资料（Remote：readDocRemote）。 */
  async readDocRemote(docId) {
    const result = await this.readDoc(BOARD, docId);
    if (!result.ok || result.data === void 0) {
      return { ok: false, ...result.code !== void 0 ? { code: result.code } : {}, ...result.message !== void 0 ? { message: result.message } : {} };
    }
    return { ok: true, title: result.data.doc.title, path: result.data.doc.path, content: result.data.content };
  }
  /** 董事会直接给某员工插一句话（Remote：nudge）。 */
  async nudge(agentId, text) {
    if (this.agent(agentId) === void 0) {
      return { ok: false, code: "unknown_agent", message: `\u5458\u5DE5 ${agentId} \u4E0D\u5B58\u5728` };
    }
    return this.sendMail(BOARD, { toId: agentId, kind: "request", body: text });
  }
  /** 手动触发一次调度/投递（Remote：tickNow）。 */
  async tickNow() {
    return this.tick();
  }
  /** 董事会派工（Remote：assign）。 */
  async assign(input) {
    return this.createTask(BOARD, input);
  }
  /** 远程更新任务（Remote：updateTaskRemote）。 */
  async updateTaskRemote(id, patch) {
    return this.updateTask(BOARD, id, patch);
  }
  /** 远程评论（Remote：commentTaskRemote）。 */
  async commentTaskRemote(id, text) {
    return this.commentTask(BOARD, id, text);
  }
  /** 董事会发信箱（Remote：mail）。 */
  async mail(input) {
    return this.sendMail(BOARD, input);
  }
  /** 远程建项目（Remote：createProjectRemote）。 */
  async createProjectRemote(input) {
    return this.createProject(BOARD, input);
  }
  /** 远程写资料（Remote：writeDocRemote）。 */
  async writeDocRemote(input) {
    return this.writeDoc(BOARD, input);
  }
  /** 远程建排程（Remote：createScheduleRemote）。 */
  async createScheduleRemote(input) {
    return this.createSchedule(BOARD, input);
  }
  /** 远程发起审批（Remote：requestApprovalRemote）。 */
  async requestApprovalRemote(input) {
    return this.requestApproval(BOARD, input);
  }
};
function emptyWorklog(key, agentId, date) {
  return {
    key,
    agentId,
    date,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    turns: 0,
    activeMs: 0,
    sessions: [],
    updatedAt: Date.now()
  };
}
function dayKey(at, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}
function renderRoleBrief(record, service) {
  return [
    `# ${record.name} \xB7 ${record.title}`,
    "",
    `- \u5458\u5DE5 ID\uFF1A${record.id}`,
    `- \u89D2\u8272\uFF1A${record.role}`,
    `- \u6C47\u62A5\u7EBF\uFF1A${service.chainOf(record.id)}`,
    `- \u5DE5\u4F5C\u76EE\u5F55\uFF1A${record.cwd}`,
    "",
    "## \u5C97\u4F4D\u804C\u8D23",
    record.persona.trim() === "" ? "\uFF08\u5F85\u8865\u5145\uFF1A\u7531\u8463\u4E8B\u4F1A\u5728\u516C\u53F8\u9762\u677F\u7F16\u8F91\uFF09" : record.persona.trim(),
    "",
    "## \u534F\u4F5C\u534F\u8BAE",
    "1. \u4E0E\u540C\u4E8B\u3001\u4E0A\u7EA7\u6C9F\u901A\u4E00\u5F8B\u4F7F\u7528\u516C\u53F8\u4FE1\u7BB1\u5DE5\u5177\uFF08company_mail_send / company_report\uFF09\u3002",
    "2. \u4EFB\u52A1\u5148\u8BA4\u9886\u518D\u6267\u884C\uFF0C\u5B8C\u6210\u7F6E review \u5E76\u6C47\u62A5\uFF1B\u88AB\u963B\u585E\u65F6\u628A\u4EFB\u52A1\u7F6E blocked \u5E76\u8BF4\u660E\u539F\u56E0\u3002",
    "3. \u8D8A\u6743\u52A8\u4F5C\u5148\u8D70 company_approval_request \u5BA1\u6279\u3002",
    "4. \u4EFB\u52A1\u8BA8\u8BBA\u6C89\u6DC0\u5728\u4EFB\u52A1\u8BC4\u8BBA\u91CC\uFF0C\u4FBF\u4E8E\u4ED6\u4EBA\u63A5\u624B\u3002",
    ""
  ].join("\n");
}
function renderMail(record, taskLabel) {
  const lines = [
    "\u3010\u516C\u53F8\u4FE1\u7BB1\u3011",
    `\u6D88\u606F ID\uFF1A${record.id}`,
    `\u6765\u81EA\uFF1A${record.fromName}\uFF08${record.fromType === "board" ? "\u8463\u4E8B\u4F1A" : record.fromType === "system" ? "\u7CFB\u7EDF" : "\u540C\u4E8B"}\uFF09`,
    `\u7C7B\u578B\uFF1A${record.kind}`
  ];
  if (taskLabel !== void 0) lines.push(`\u5173\u8054\u4EFB\u52A1\uFF1A${taskLabel}`);
  lines.push("---", record.body, "---");
  lines.push("\u5904\u7406\u65B9\u5F0F\uFF1A\u9700\u8981\u56DE\u8BDD\u7528 `company_mail_send`\uFF1B\u4EFB\u52A1\u8FDB\u5C55\u7528 `company_task_update`\uFF1B\u5B8C\u6210\u540E\u7528 `company_report` \u5411\u4E0A\u7EA7\u6C47\u62A5\u3002");
  return lines.join("\n");
}
function renderChannelFrame(record, taskLabel, fromName) {
  const intro = record.kind === "announce" ? `\u3010\u64AD\u62A5\u4EFB\u52A1\u3011${fromName} \u8981\u5411\u8463\u4E8B\u4F1A\u64AD\u62A5\u4EE5\u4E0B\u5185\u5BB9\uFF1A` : `\u3010\u4E0B\u5C5E\u6C47\u62A5\u3011${fromName} \u5B8C\u6210\u4E86\u4E00\u9879\u5DE5\u4F5C\uFF0C\u8BF7\u8F6C\u6210\u7ED9\u8463\u4E8B\u4F1A\u7684\u7B80\u62A5\uFF1A`;
  const lines = [
    intro,
    ...taskLabel !== void 0 ? [`\u5173\u8054\u4EFB\u52A1\uFF1A${taskLabel}`] : [],
    "---",
    record.body,
    "---",
    "\u6309\u4F60\u7684\u7B80\u62A5\u683C\u5F0F\u8F93\u51FA\uFF08\u5148\u7ED3\u8BBA\u540E\u7EC6\u8282\uFF1Bmarkdown\uFF1B\u4E0D\u590D\u8FF0\u672C\u6307\u4EE4\uFF1B\u4E0D\u8C03\u7528\u5DE5\u5177\uFF09\u3002"
  ];
  return lines.join("\n");
}
function renderTaskDispatch(task, service) {
  const manager = task.assigneeId === null ? void 0 : service.agent(task.assigneeId)?.managerId;
  return [
    "\u3010\u65B0\u4EFB\u52A1\u3011",
    `\u4EFB\u52A1\uFF1A${task.title}\uFF08${task.id}\uFF09`,
    `\u8BF4\u660E\uFF1A${task.desc === "" ? "\uFF08\u65E0\uFF09" : task.desc}`,
    `\u4F18\u5148\u7EA7\uFF1A${task.priority}${task.dueAt === null ? "" : ` \xB7 \u622A\u6B62\uFF1A${new Date(task.dueAt).toISOString()}`}`,
    manager === void 0 || manager === null ? "" : `\u7531 ${service.agent(manager)?.name ?? manager} \u6307\u6D3E\u3002`,
    "\u8BF7\u5148\u7528 `company_task_update`\uFF08checkout=true\uFF09\u8BA4\u9886\uFF0C\u518D\u52A8\u624B\uFF1B\u5B8C\u6210\u540E\u7F6E status=review \u5E76\u7528 `company_report` \u6C47\u62A5\u7ED3\u8BBA\u3002"
  ].filter((line) => line !== "").join("\n");
}
function renderScheduleFire(record, atIso) {
  return [
    "\u3010\u5B9A\u65F6\u4EFB\u52A1\u3011",
    `\u6392\u7A0B\uFF1A${record.id}\uFF08${describeSchedule(record)}\uFF09`,
    `\u89E6\u53D1\u65F6\u95F4\uFF1A${atIso}`,
    "---",
    record.prompt,
    "---",
    "\u6309\u63D0\u793A\u8BCD\u6267\u884C\uFF1B\u6709\u7ED3\u8BBA\u7528 `company_report` \u6C47\u62A5\uFF0C\u9700\u8981\u4ED6\u4EBA\u534F\u4F5C\u53D1 `company_mail_send`\u3002"
  ].join("\n");
}
function renderApprovalAsk(record, action) {
  return [
    "\u3010\u5BA1\u6279\u8BF7\u6C42\u3011",
    `\u5BA1\u6279\uFF1A${record.id} \xB7 \u7C7B\u522B ${record.kind}`,
    `\u6807\u9898\uFF1A${record.title}`,
    `\u53D1\u8D77\uFF1A${record.requesterName}`,
    "---",
    record.detail,
    "---",
    `${action}\uFF1A\u6279\u51C6\u540E\u4EFB\u52A1\u7167\u5E38\u63A8\u8FDB\uFF1B\u9A73\u56DE\u5219\u8BF7\u53D1\u8D77\u4EBA\u8C03\u6574\u65B9\u6848\u3002`
  ].join("\n");
}
function renderApprovalResult(record, note) {
  return [
    "\u3010\u5BA1\u6279\u7ED3\u679C\u3011",
    `\u5BA1\u6279\uFF1A${record.id} \xB7 ${record.title}`,
    `\u7ED3\u679C\uFF1A${record.status === "approved" ? "\u2705 \u5DF2\u6279\u51C6" : "\u274C \u5DF2\u9A73\u56DE"}`,
    note.trim() === "" ? "" : `\u8463\u4E8B\u4F1A\u8BF4\u660E\uFF1A${note}`,
    "\u636E\u6B64\u7EE7\u7EED\u63A8\u8FDB\uFF08\u6279\u51C6\u540E\u7167\u5E38\u6267\u884C\uFF1B\u9A73\u56DE\u5219\u8C03\u6574\u65B9\u6848\u6216\u91CD\u65B0\u7533\u8BF7\uFF09\u3002"
  ].filter((line) => line !== "").join("\n");
}
function describeSchedule(record) {
  if (record.kind === "cron") return `cron\u300C${record.cron}\u300D`;
  if (record.kind === "every") return `\u6BCF ${record.everySec} \u79D2`;
  return `\u4E00\u6B21\u6027 ${record.at === null ? "" : new Date(record.at).toISOString()}`;
}
function excerpt(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}\u2026` : flat;
}
function parseSchedule(input, timeZone) {
  const now = Date.now();
  if (input.kind === "every") {
    const everySec = Number(input.spec.trim());
    if (!Number.isFinite(everySec) || everySec < 60) {
      return { ok: false, code: "invalid_rule", message: "every \u89C4\u683C\u662F\u79D2\u6570\uFF0C\u4E14\u4E0D\u5F97\u5C0F\u4E8E 60" };
    }
    return { ok: true, nextRunAt: now + everySec * 1e3, everySec, at: 0 };
  }
  if (input.kind === "at") {
    const at = Date.parse(input.spec.trim());
    if (!Number.isFinite(at)) return { ok: false, code: "invalid_rule", message: "at \u89C4\u683C\u9700\u4E3A ISO \u65F6\u95F4\u6233" };
    if (at <= now) return { ok: false, code: "not_future", message: "at \u5FC5\u987B\u665A\u4E8E\u5F53\u524D\u65F6\u95F4" };
    return { ok: true, nextRunAt: at, everySec: 0, at };
  }
  const next = nextCron(input.spec.trim(), now, timeZone);
  if (next === null) return { ok: false, code: "invalid_rule", message: `cron \u8868\u8FBE\u5F0F\u65E0\u6CD5\u89E3\u6790\uFF1A${input.spec}` };
  return { ok: true, nextRunAt: next, everySec: 0, at: 0 };
}
function advance(record, from, timeZone) {
  if (record.kind === "at") return null;
  if (record.kind === "every") {
    const step = (record.everySec ?? 0) * 1e3;
    if (step <= 0) return null;
    let next = record.nextRunAt;
    while (next <= from) next += step;
    return next;
  }
  return nextCron(record.cron ?? "", from, timeZone);
}
function nextCron(expression, from, timeZone) {
  const parser = cronParser();
  if (parser === null) return null;
  try {
    const interval = parser.parseExpression(expression, { currentDate: new Date(from), tz: timeZone });
    return interval.next().toDate().getTime();
  } catch {
    return null;
  }
}
var cachedCron;
function cronParser() {
  if (cachedCron !== void 0) return cachedCron;
  try {
    cachedCron = createRequire(import.meta.url)("cron-parser");
  } catch {
    cachedCron = null;
  }
  return cachedCron;
}

// node_modules/@deepseek-ai/dsh-tools/lib/index.js
import z4 from "@deepseek-ai/schemastery";

// node_modules/@deepseek-ai/dsh-scope/lib/index.js
var NamedEntries = class {
  duplicateError;
  data = /* @__PURE__ */ new Map();
  constructor(duplicateError) {
    this.duplicateError = duplicateError;
  }
  /**
  * Insert one unique name.
  * @param name - name unique within this table.
  * @param value - borrowed value to retain.
  * @returns an idempotent undo that removes only this insertion.
  */
  insert(name2, value) {
    const data = this.data;
    if (data.has(name2)) throw this.duplicateError(name2);
    data.set(name2, value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      data.delete(name2);
      if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
    };
  }
  /**
  * Read one named value.
  * @param name - name to resolve.
  * @returns the retained value, or `undefined` when absent.
  */
  get(name2) {
    return this.data.get(name2);
  }
  /**
  * Test one name for membership.
  * @param name - name to test.
  * @returns whether the table contains that name.
  */
  has(name2) {
    return this.data.has(name2);
  }
  /**
  * Iterate live names in insertion order.
  * @returns the native live key iterator.
  */
  keys() {
    return this.data.keys();
  }
  /**
  * Iterate live entries in insertion order.
  * @returns the native live entry iterator.
  */
  entries() {
    return this.data.entries();
  }
  /**
  * Iterate live values in insertion order.
  * @returns the native live value iterator.
  */
  values() {
    return this.data.values();
  }
  /**
  * Test whether this table has no entries.
  * @returns whether the table is empty.
  */
  isEmpty() {
    return this.data.size === 0;
  }
};
var AnonymousEntries = class {
  data = /* @__PURE__ */ new Map();
  /**
  * Append one independently owned value.
  * @param value - borrowed value to retain.
  * @returns an idempotent undo for this exact append.
  */
  append(value) {
    const data = this.data;
    const key = Symbol();
    data.set(key, value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      data.delete(key);
      if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
    };
  }
  /**
  * Iterate live values in insertion order.
  * @returns the native live value iterator.
  */
  values() {
    return this.data.values();
  }
  /**
  * Test whether this table has no entries.
  * @returns whether the table is empty.
  */
  isEmpty() {
    return this.data.size === 0;
  }
};
var ScopedLayers = class {
  createLayer;
  onChange;
  /** The eagerly constructed context-global layer. */
  global;
  scoped = /* @__PURE__ */ new Map();
  constructor(createLayer, onChange) {
    this.createLayer = createLayer;
    this.onChange = onChange;
    this.global = createLayer(void 0);
  }
  /**
  * Read an existing exact-scope overlay. Deliberately chain-blind: callers
  * addressing one scope's OWN contributions (its restrictions, its guards)
  * must not silently pick up an ancestor's — use {@link chainLayers} where
  * inheritance is the point.
  * @param scope - exact scope key; `undefined` denotes no overlay.
  * @returns the existing scoped layer, or `undefined` without creating one.
  */
  peek(scope) {
    if (scope === void 0) return void 0;
    return this.scoped.get(scope);
  }
  /**
  * Existing overlays along the scope's parent chain ({@link scopeChainOf}),
  * farthest ancestor first and the exact scope last, so a caller layering
  * them in order gives the nearest scope the final word.
  * @param scope - viewing scope, or `undefined` for no overlays.
  * @returns the existing layers, nearest last; absent overlays are skipped.
  */
  chainLayers(scope) {
    const layers = [];
    for (const key of scopeChainOf(scope).reverse()) {
      const layer = this.scoped.get(key);
      if (layer !== void 0) layers.push(layer);
    }
    return layers;
  }
  /**
  * Materialize global named entries followed by scope-chain shadows,
  * farthest ancestor first, so the nearest scope's entry wins a name.
  * @param scope - viewing scope, or `undefined` for the global view.
  * @param pick - select the named table from a layer.
  * @returns an insertion-ordered effective map.
  */
  merge(scope, pick) {
    const merged = new Map(pick(this.global).entries());
    for (const layer of this.chainLayers(scope)) for (const [name2, value] of pick(layer).entries()) merged.set(name2, value);
    return merged;
  }
  /**
  * Attach one synchronous layer mutation to its registration context.
  * @param ctx - context that determines both scope visibility and effect ownership.
  * @param action - atomic mutation returning its synchronous undo.
  * @param options - Cordis effect label and optional change notification.
  * @returns the exact disposer returned by `ctx.effect()`.
  */
  effect(ctx, action, options) {
    const scope = scopeOf(ctx);
    const notify = options.notify ?? true;
    return ctx.effect(function* () {
      let layer;
      let created = false;
      if (scope === void 0) layer = this.global;
      else {
        const existing = this.scoped.get(scope);
        if (existing === void 0) {
          layer = this.createLayer(scope);
          this.scoped.set(scope, layer);
          created = true;
        } else layer = existing;
      }
      let undo;
      try {
        undo = action(layer);
      } catch (error) {
        if (scope !== void 0 && created && layer.isEmpty()) this.scoped.delete(scope);
        throw error;
      }
      yield () => {
        undo();
        if (scope !== void 0 && layer.isEmpty()) this.scoped.delete(scope);
        if (notify) this.onChange();
      };
      if (notify) this.onChange();
    }.bind(this), options.label);
  }
};
var kScope = Symbol("dsh.scope");
var carrierKeys = /* @__PURE__ */ new WeakMap();
var scopeParents = /* @__PURE__ */ new WeakMap();
function scopeChainOf(key) {
  const chain = [];
  for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) chain.push(cursor);
  return chain;
}
function scopeOf(ctx) {
  return ctx[kScope];
}
function scopeTarget(base, key) {
  const baseFilter = base[Context.filter];
  const carrier = { [Context.filter](ctx) {
    if (baseFilter !== void 0 && !baseFilter.call(base, ctx)) return false;
    const tag = scopeOf(ctx);
    if (tag === void 0) return true;
    for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) if (cursor === tag) return true;
    return false;
  } };
  carrierKeys.set(carrier, key);
  return carrier;
}

// node_modules/@deepseek-ai/dsh-tools/lib/index.js
import { HarnessError, createUserMessage as createUserMessage2 } from "@deepseek-ai/dsh-llm";

// node_modules/@deepseek-ai/dsh-util-values/lib/index.js
function assertNever(value, context) {
  const rendered = JSON.stringify(value) ?? String(value);
  throw new Error(`unreachable variant${context ? ` in ${context}` : ""}: ${rendered}`);
}
function hasIntrinsicConstructor(prototype, name2) {
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (typeof constructor !== "function") return false;
  try {
    return constructor.name === name2 && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name2}() { [native code] }`;
  } catch {
    return false;
  }
}
function isIntrinsicObjectPrototype(value) {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, "Object");
}
function hasPlainArrayPrototype(value) {
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, "Array")) return false;
  const objectPrototype = Object.getPrototypeOf(prototype);
  return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype(objectPrototype);
}
function hasPlainObjectPrototype(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype(prototype);
}
function enumerableStringKeys(value) {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(value, key))) return void 0;
  return keys;
}
function walkJsonValue(value, detach) {
  const ancestors = /* @__PURE__ */ new Set();
  let root;
  const assign = (destination, item) => {
    if (destination === void 0) return;
    if (destination.kind === "root") root = item;
    else if (destination.kind === "array") destination.target[destination.index] = item;
    else Object.defineProperty(destination.target, destination.key, {
      value: item,
      enumerable: true,
      configurable: true,
      writable: true
    });
  };
  const tasks = [{
    kind: "visit",
    value,
    ...detach ? { destination: { kind: "root" } } : {}
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      ancestors.delete(task.source);
      continue;
    }
    if (task.kind === "array-item") {
      if (!Object.prototype.hasOwnProperty.call(task.source, task.index)) return void 0;
      tasks.push({
        kind: "visit",
        value: task.source[task.index],
        ...task.target === void 0 ? {} : { destination: {
          kind: "array",
          target: task.target,
          index: task.index
        } }
      });
      continue;
    }
    if (task.kind === "object-property") {
      tasks.push({
        kind: "visit",
        value: task.source[task.key],
        ...task.target === void 0 ? {} : { destination: {
          kind: "object",
          target: task.target,
          key: task.key
        } }
      });
      continue;
    }
    const current = task.value;
    if (current === null) {
      assign(task.destination, null);
      continue;
    }
    if (typeof current === "boolean" || typeof current === "string") {
      assign(task.destination, current);
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current) || Object.is(current, -0)) return void 0;
      assign(task.destination, current);
      continue;
    }
    if (typeof current !== "object") return void 0;
    if (ancestors.has(current)) return void 0;
    if (Array.isArray(current)) {
      if (!hasPlainArrayPrototype(current)) return void 0;
      const length = current.length;
      if (Reflect.ownKeys(current).length !== length + 1) return void 0;
      const target2 = detach ? [] : void 0;
      if (target2 !== void 0) assign(task.destination, target2);
      ancestors.add(current);
      tasks.push({
        kind: "leave",
        source: current
      });
      for (let index = length - 1; index >= 0; index--) tasks.push({
        kind: "array-item",
        source: current,
        index,
        ...target2 === void 0 ? {} : { target: target2 }
      });
      continue;
    }
    if (!hasPlainObjectPrototype(current)) return void 0;
    const keys = enumerableStringKeys(current);
    if (keys === void 0) return void 0;
    const target = detach ? {} : void 0;
    if (target !== void 0) assign(task.destination, target);
    ancestors.add(current);
    tasks.push({
      kind: "leave",
      source: current
    });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) return void 0;
      tasks.push({
        kind: "object-property",
        source: current,
        key,
        ...target === void 0 ? {} : { target }
      });
    }
  }
  return detach ? root : true;
}
function snapshotJsonValue(value) {
  return walkJsonValue(value, true);
}
function isJsonValue(value) {
  return walkJsonValue(value, false) === true;
}
function deepFreeze(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  const pending = [{
    kind: "visit",
    node: value
  }];
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === void 0) continue;
    if (task.kind === "property") {
      pending.push({
        kind: "visit",
        node: task.source[task.key]
      });
      continue;
    }
    const node = task.node;
    if (node === null || typeof node !== "object") continue;
    if (node instanceof AbortSignal) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    Object.freeze(node);
    const keys = Object.keys(node);
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) continue;
      pending.push({
        kind: "property",
        source: node,
        key
      });
    }
  }
  return value;
}

// node_modules/@deepseek-ai/dsh-brand/lib/index.js
function brandString(value) {
  return value;
}

// node_modules/@deepseek-ai/dsh-tools/lib/index.js
var JsonSchemaError = class extends HarnessError {
  /** Individual schema violations in walk order. */
  violations;
  constructor(violations) {
    super(`unsupported JSON schema: ${violations.join("; ")}`, "UNSUPPORTED_SCHEMA");
    this.name = "JsonSchemaError";
    this.violations = violations;
  }
};
var CONSTRAINT_KEYWORDS = /* @__PURE__ */ new Set([
  "type",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const"
]);
var ANNOTATION_KEYWORDS = /* @__PURE__ */ new Set([
  "description",
  "title",
  "default",
  "examples"
]);
var SCHEMA_TYPES = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null"
];
function hasIntrinsicConstructor2(prototype, name2) {
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (typeof constructor !== "function") return false;
  try {
    return constructor.name === name2 && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name2}() { [native code] }`;
  } catch {
    return false;
  }
}
function isIntrinsicObjectPrototype2(value) {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor2(value, "Object");
}
function isPlainJsonRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype2(prototype);
  } catch {
    return false;
  }
}
function hasPlainArrayPrototype2(value) {
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor2(prototype, "Array")) return false;
  const objectPrototype = Object.getPrototypeOf(prototype);
  return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype2(objectPrototype);
}
function hasOnlyEnumerableStringKeys(value) {
  try {
    return Reflect.ownKeys(value).every((key) => typeof key === "string" && Object.prototype.propertyIsEnumerable.call(value, key));
  } catch {
    return false;
  }
}
function isJsonSchemaRecord(value) {
  return isPlainJsonRecord(value) && hasOnlyEnumerableStringKeys(value);
}
function isPlainJsonArray(value) {
  if (!Array.isArray(value)) return false;
  try {
    if (!hasPlainArrayPrototype2(value) || Reflect.ownKeys(value).length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return false;
    return true;
  } catch {
    return false;
  }
}
function isJsonNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}
function scalarMatches(type, value) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return isJsonNumber(value);
    case "integer":
      return isJsonNumber(value) && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    /* v8 ignore next -- JsonSchemaScalarType is closed; this retains compile-time exhaustiveness. */
    default:
      return assertNever(type, "JsonSchemaType");
  }
}
var ONE_OF_SIBLING_KEYWORDS = [
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const"
];
function checkObjectSchemaTail(node, path, properties, violations) {
  const hasRequired = Object.hasOwn(node, "required");
  const required = hasRequired ? node.required : void 0;
  if (hasRequired) if (!isPlainJsonArray(required) || required.some((entry) => typeof entry !== "string")) violations.push(`${path}.required must be an array of strings`);
  else {
    const declared = isJsonSchemaRecord(properties) ? properties : {};
    for (const key of required) if (!Object.hasOwn(declared, key)) violations.push(`${path}.required names "${key}" which is not in properties`);
  }
  if (Object.hasOwn(node, "additionalProperties") && typeof node.additionalProperties !== "boolean") violations.push(`${path}.additionalProperties must be a boolean`);
}
function checkSchemaNode(root, rootPath, violations, seen) {
  const tasks = [{
    kind: "enter",
    node: root,
    path: rootPath
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      seen.delete(task.node);
      continue;
    }
    if (task.kind === "one-of-tail") {
      for (const key of ONE_OF_SIBLING_KEYWORDS) if (Object.hasOwn(task.node, key)) violations.push(`${task.path}.${key} is not supported beside oneOf`);
      continue;
    }
    if (task.kind === "object-tail") {
      checkObjectSchemaTail(task.node, task.path, task.properties, violations);
      continue;
    }
    const { node, path } = task;
    if (!isJsonSchemaRecord(node)) {
      violations.push(`${path} must be a schema object`);
      continue;
    }
    if (seen.has(node)) {
      violations.push(`${path} is circular`);
      continue;
    }
    seen.add(node);
    tasks.push({
      kind: "leave",
      node
    });
    for (const key of Object.keys(node)) {
      if (CONSTRAINT_KEYWORDS.has(key)) continue;
      if (ANNOTATION_KEYWORDS.has(key)) {
        try {
          if (!isJsonValue(node[key])) violations.push(`${path}.${key} annotation must be lossless JSON data`);
        } catch {
          violations.push(`${path}.${key} annotation must be lossless JSON data`);
        }
        continue;
      }
      violations.push(`${path}.${key} is not a supported keyword (subset: type/oneOf/properties/required/additionalProperties/items/enum/const + annotations)`);
    }
    if (Object.hasOwn(node, "description") && typeof node.description !== "string") violations.push(`${path}.description must be a string`);
    if (Object.hasOwn(node, "title") && typeof node.title !== "string") violations.push(`${path}.title must be a string`);
    const hasType = Object.hasOwn(node, "type");
    const hasOneOf = Object.hasOwn(node, "oneOf");
    if (hasType && hasOneOf) {
      violations.push(`${path} cannot declare both type and oneOf`);
      continue;
    }
    if (!hasType && !hasOneOf) {
      for (const key of ONE_OF_SIBLING_KEYWORDS) if (Object.hasOwn(node, key)) violations.push(`${path}.${key} requires type or oneOf`);
      continue;
    }
    if (hasOneOf) {
      const oneOf = node.oneOf;
      tasks.push({
        kind: "one-of-tail",
        node,
        path
      });
      if (!isPlainJsonArray(oneOf) || oneOf.length < 2) violations.push(`${path}.oneOf must be an array of at least two schemas`);
      else for (let index = oneOf.length - 1; index >= 0; index--) tasks.push({
        kind: "enter",
        node: oneOf[index],
        path: `${path}.oneOf[${index}]`
      });
      continue;
    }
    const type = node.type;
    if (typeof type !== "string" || !SCHEMA_TYPES.includes(type)) {
      violations.push(Array.isArray(type) ? `${path}.type must be a single type string (type arrays are not supported)` : `${path}.type must be one of ${SCHEMA_TYPES.join("/")}`);
      continue;
    }
    const schemaType = type;
    for (const [key, types] of Object.entries({
      properties: ["object"],
      required: ["object"],
      additionalProperties: ["object"],
      items: ["array"],
      enum: [
        "string",
        "number",
        "integer",
        "boolean",
        "null"
      ],
      const: [
        "string",
        "number",
        "integer",
        "boolean",
        "null"
      ]
    })) if (Object.hasOwn(node, key) && !types.includes(schemaType)) violations.push(`${path}.${key} is not supported on type "${schemaType}"`);
    switch (schemaType) {
      case "object": {
        const properties = Object.hasOwn(node, "properties") ? node.properties : void 0;
        tasks.push({
          kind: "object-tail",
          node,
          path,
          properties
        });
        if (Object.hasOwn(node, "properties")) if (!isJsonSchemaRecord(properties)) violations.push(`${path}.properties must be an object of schemas`);
        else {
          const entries = Object.entries(properties);
          for (let index = entries.length - 1; index >= 0; index--) {
            const entry = entries[index];
            if (entry === void 0) continue;
            tasks.push({
              kind: "enter",
              node: entry[1],
              path: `${path}.properties.${entry[0]}`
            });
          }
        }
        break;
      }
      case "array":
        if (Object.hasOwn(node, "items")) tasks.push({
          kind: "enter",
          node: node.items,
          path: `${path}.items`
        });
        break;
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null": {
        const hasEnum = Object.hasOwn(node, "enum");
        const allowed = hasEnum ? node.enum : void 0;
        const enumValid = isPlainJsonArray(allowed) && allowed.length > 0 && allowed.every((entry) => scalarMatches(schemaType, entry));
        if (hasEnum && !enumValid) violations.push(`${path}.enum must be a non-empty array of ${schemaType} values`);
        const hasConst = Object.hasOwn(node, "const");
        const declaredConst = hasConst ? node.const : void 0;
        const constValid = scalarMatches(schemaType, declaredConst);
        if (hasConst) {
          if (!constValid) violations.push(`${path}.const must be a ${schemaType} value`);
          else if (enumValid && !allowed.includes(declaredConst)) violations.push(`${path}.const must be one of ${path}.enum when both are declared`);
        }
        break;
      }
      /* v8 ignore next -- schemaType was narrowed from the closed SCHEMA_TYPES table above. */
      default:
        assertNever(schemaType, "JsonSchemaType");
    }
  }
}
function assertSupportedJsonSchema(schema) {
  const violations = [];
  checkSchemaNode(schema, "schema", violations, /* @__PURE__ */ new Set());
  if (violations.length > 0) throw new JsonSchemaError(violations);
}
function safelyIsJsonValue(value) {
  try {
    return isJsonValue(value);
  } catch {
    return false;
  }
}
function diagnosticPath(path) {
  return path === "" ? "arguments" : path;
}
function propertyPath(path, key) {
  return path === "" ? key : `${path}.${key}`;
}
function losslessValueViolation(path) {
  return [`"${diagnosticPath(path)}" must be a lossless JSON value`];
}
function appendViolations(target, source) {
  for (const violation of source) target.push(violation);
}
function valueFrame(node, value, path) {
  return {
    node,
    value,
    path,
    catches: false,
    phase: "start",
    children: [],
    childIndex: 0,
    violations: [],
    tailViolations: [],
    matches: 0
  };
}
function checkScalarValue(node, value, path) {
  const allowed = Object.hasOwn(node, "enum") ? node.enum : void 0;
  if (allowed !== void 0 && !allowed.includes(value)) return [`"${diagnosticPath(path)}" must be one of ${JSON.stringify(allowed)}`];
  if (Object.hasOwn(node, "const") && value !== node.const) return [`"${diagnosticPath(path)}" must be ${JSON.stringify(node.const)}`];
  return [];
}
function checkValue(schema, value, path) {
  const frames = [valueFrame(schema, value, path)];
  let rootResult;
  const receive = (result) => {
    const parent = frames.at(-1);
    if (parent === void 0) {
      rootResult = result;
      return;
    }
    if (parent.kind === "oneOf") {
      if (result.length === 0) parent.matches++;
    } else appendViolations(parent.violations, result);
  };
  const finish = (result) => {
    frames.pop();
    receive(result);
  };
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === void 0) break;
    try {
      if (frame.phase === "children") {
        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex];
          if (child === void 0) throw new Error("missing schema-value child frame");
          frame.childIndex++;
          frames.push(valueFrame(child.node, child.value, child.path));
          continue;
        }
        if (frame.kind === "oneOf") {
          finish(frame.matches === 1 ? [] : [`"${diagnosticPath(frame.path)}" must match exactly one oneOf branch (matched ${frame.matches})`]);
          continue;
        }
        appendViolations(frame.violations, frame.tailViolations);
        if (frame.violations.length > 0) finish(frame.violations);
        else if (frame.kind === "object") finish(safelyIsJsonValue(frame.value) ? [] : [`"${diagnosticPath(frame.path)}" must be a lossless JSON object`]);
        else finish(safelyIsJsonValue(frame.value) ? [] : [`"${diagnosticPath(frame.path)}" must be a dense lossless JSON array`]);
        continue;
      }
      const nodeType = Object.hasOwn(frame.node, "type") ? frame.node.type : void 0;
      frame.catches = !(nodeType !== void 0 && !SCHEMA_TYPES.includes(nodeType));
      const oneOf = Object.hasOwn(frame.node, "oneOf") ? frame.node.oneOf : void 0;
      if (oneOf !== void 0) {
        frame.kind = "oneOf";
        frame.children = Array.from(oneOf, (branch) => ({
          node: branch,
          value: frame.value,
          path: frame.path
        }));
        frame.childIndex = 0;
        frame.matches = 0;
        frame.phase = "children";
        continue;
      }
      if (nodeType === void 0) {
        finish(safelyIsJsonValue(frame.value) ? [] : losslessValueViolation(frame.path));
        continue;
      }
      switch (nodeType) {
        case "object": {
          if (!isPlainJsonRecord(frame.value)) {
            finish([`"${diagnosticPath(frame.path)}" must be an object`]);
            break;
          }
          const properties = Object.hasOwn(frame.node, "properties") ? frame.node.properties ?? {} : {};
          const violations = [];
          const required = Object.hasOwn(frame.node, "required") ? frame.node.required ?? [] : [];
          for (const key of required) if (!Object.hasOwn(frame.value, key) || frame.value[key] === void 0) violations.push(`missing required property "${propertyPath(frame.path, key)}"`);
          const children = [];
          for (const [key, child] of Object.entries(properties)) {
            if (!Object.hasOwn(frame.value, key) || frame.value[key] === void 0) continue;
            children.push({
              node: child,
              value: frame.value[key],
              path: propertyPath(frame.path, key)
            });
          }
          const tailViolations = [];
          if (Object.hasOwn(frame.node, "additionalProperties") && frame.node.additionalProperties === false) {
            for (const key of Object.keys(frame.value)) if (!Object.hasOwn(properties, key)) tailViolations.push(`"${propertyPath(frame.path, key)}" is not a declared property (additionalProperties: false)`);
          }
          frame.kind = "object";
          frame.children = children;
          frame.childIndex = 0;
          frame.violations = violations;
          frame.tailViolations = tailViolations;
          frame.phase = "children";
          break;
        }
        case "array": {
          if (!Array.isArray(frame.value)) {
            finish([`"${diagnosticPath(frame.path)}" must be an array`]);
            break;
          }
          const items = Object.hasOwn(frame.node, "items") ? frame.node.items : void 0;
          const children = items === void 0 ? [] : frame.value.flatMap((entry, index) => [{
            node: items,
            value: entry,
            path: `${frame.path}[${index}]`
          }]);
          frame.kind = "array";
          frame.children = children;
          frame.childIndex = 0;
          frame.violations = [];
          frame.phase = "children";
          break;
        }
        case "string":
          finish(typeof frame.value === "string" ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be a string`]);
          break;
        case "number":
          finish(typeof frame.value !== "number" ? [`"${diagnosticPath(frame.path)}" must be a number`] : !isJsonNumber(frame.value) ? [`"${diagnosticPath(frame.path)}" must be a finite JSON number`] : checkScalarValue(frame.node, frame.value, frame.path));
          break;
        case "integer":
          finish(!isJsonNumber(frame.value) || !Number.isInteger(frame.value) ? [`"${diagnosticPath(frame.path)}" must be an integer`] : checkScalarValue(frame.node, frame.value, frame.path));
          break;
        case "boolean":
          finish(typeof frame.value === "boolean" ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be a boolean`]);
          break;
        case "null":
          finish(frame.value === null ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be null`]);
          break;
        default:
          finish(assertNever(nodeType, "JsonSchemaType"));
      }
    } catch (error) {
      let failed = frames.pop();
      while (failed !== void 0 && !failed.catches) failed = frames.pop();
      if (failed === void 0) throw error;
      receive(losslessValueViolation(failed.path));
    }
  }
  return rootResult ?? losslessValueViolation(path);
}
function validateJsonSchemaValue(schema, value, path = "value") {
  return checkValue(schema, value, path);
}
var ANNOTATION_KEYS = [
  "description",
  "title",
  "default",
  "examples"
];
function authorError(message) {
  throw new JsonSchemaError([message]);
}
function copyAnnotations(source, target) {
  if (Object.hasOwn(source, "description")) target.description = source.description;
  if (Object.hasOwn(source, "title")) target.title = source.title;
  if (Object.hasOwn(source, "default")) target.default = source.default;
  if (Object.hasOwn(source, "examples")) target.examples = source.examples;
}
function assertAuthorKeys(source, path, allowed) {
  for (const key of Object.keys(source)) if (!allowed.includes(key)) authorError(`${path}.${key} is not supported by the value schema DSL`);
}
function assignCompiledNode(destination, node) {
  switch (destination.kind) {
    case "root":
      destination.holder.value = node;
      break;
    case "property":
      Object.defineProperty(destination.target, destination.key, {
        value: node,
        enumerable: true,
        configurable: true,
        writable: true
      });
      break;
    case "item":
      destination.target.items = node;
      break;
    case "one-of":
      destination.target[destination.index] = node;
      break;
  }
}
function assignCompiledPropertyMap(destination, compiled) {
  if (destination.kind === "root") destination.holder.value = compiled;
  else destination.target.properties = compiled.properties;
}
function runSchemaCompiler(initial) {
  const seen = /* @__PURE__ */ new Set();
  const tasks = [initial];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      seen.delete(task.input);
      continue;
    }
    if (task.kind === "property-map-tail") {
      if (task.required.length > 0) {
        task.compiled.required = task.required;
        if (task.destination.kind === "object") task.destination.target.required = task.required;
      }
      continue;
    }
    if (task.kind === "property") {
      if (!isJsonSchemaRecord(task.property)) authorError(`${task.path} must be a value schema object`);
      if (Object.hasOwn(task.property, "required") && task.property.required !== true) authorError(`${task.path}.required must be true when present`);
      if (Object.hasOwn(task.property, "required") && task.property.required === true) task.required.push(task.key);
      tasks.push({
        kind: "value",
        input: task.property,
        path: task.path,
        allowRequired: true,
        destination: {
          kind: "property",
          target: task.properties,
          key: task.key
        }
      });
      continue;
    }
    if (task.kind === "property-map") {
      if (!isJsonSchemaRecord(task.input)) authorError(`${task.path} must be an object of value schemas`);
      if (seen.has(task.input)) authorError(`${task.path} is circular`);
      seen.add(task.input);
      const compiled = { properties: {} };
      const required = [];
      assignCompiledPropertyMap(task.destination, compiled);
      tasks.push({
        kind: "leave",
        input: task.input
      });
      tasks.push({
        kind: "property-map-tail",
        compiled,
        required,
        destination: task.destination
      });
      const entries = Object.entries(task.input);
      for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index];
        if (entry === void 0) continue;
        tasks.push({
          kind: "property",
          property: entry[1],
          path: `${task.path}.${entry[0]}`,
          key: entry[0],
          properties: compiled.properties,
          required
        });
      }
      continue;
    }
    const { input, path } = task;
    if (!isJsonSchemaRecord(input)) authorError(`${path} must be a value schema object`);
    if (seen.has(input)) authorError(`${path} is circular`);
    seen.add(input);
    const authorKeys = [...ANNOTATION_KEYS, ...task.allowRequired ? ["required"] : []];
    const node = {};
    assignCompiledNode(task.destination, node);
    tasks.push({
      kind: "leave",
      input
    });
    if (Object.hasOwn(input, "oneOf")) {
      assertAuthorKeys(input, path, [
        ...authorKeys,
        "oneOf",
        "type"
      ]);
      if (Object.hasOwn(input, "type")) authorError(`${path} cannot declare both type and oneOf`);
      if (!isPlainJsonArray(input.oneOf)) authorError(`${path}.oneOf must be an array of at least two value schemas`);
      const branches = [];
      node.oneOf = branches;
      copyAnnotations(input, node);
      for (let index = input.oneOf.length - 1; index >= 0; index--) tasks.push({
        kind: "value",
        input: input.oneOf[index],
        path: `${path}.oneOf[${index}]`,
        allowRequired: false,
        destination: {
          kind: "one-of",
          target: branches,
          index
        }
      });
      continue;
    }
    const inputType = Object.hasOwn(input, "type") ? input.type : void 0;
    switch (inputType) {
      case "json":
        assertAuthorKeys(input, path, [...authorKeys, "type"]);
        copyAnnotations(input, node);
        break;
      case "object":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "properties",
          "additionalProperties"
        ]);
        if (!Object.hasOwn(input, "additionalProperties") || typeof input.additionalProperties !== "boolean") authorError(`${path}.additionalProperties must be explicitly true or false`);
        node.type = "object";
        copyAnnotations(input, node);
        node.additionalProperties = input.additionalProperties;
        if (Object.hasOwn(input, "properties")) tasks.push({
          kind: "property-map",
          input: input.properties,
          path: `${path}.properties`,
          destination: {
            kind: "object",
            target: node
          }
        });
        break;
      case "array":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "items"
        ]);
        node.type = "array";
        copyAnnotations(input, node);
        if (Object.hasOwn(input, "items")) tasks.push({
          kind: "value",
          input: input.items,
          path: `${path}.items`,
          allowRequired: false,
          destination: {
            kind: "item",
            target: node
          }
        });
        break;
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "enum",
          "const"
        ]);
        node.type = inputType;
        copyAnnotations(input, node);
        if (Object.hasOwn(input, "enum")) {
          if (!isPlainJsonArray(input.enum)) authorError(`${path}.enum must be a non-empty array of scalar values`);
          node.enum = Array.from(input.enum, (entry) => entry);
        }
        if (Object.hasOwn(input, "const")) node.const = input.const;
        break;
      default:
        authorError(`${path}.type must be string/number/integer/boolean/null/array/object/json, or use oneOf`);
    }
  }
}
function compilePropertyMap(input, path) {
  const holder = {};
  runSchemaCompiler({
    kind: "property-map",
    input,
    path,
    destination: {
      kind: "root",
      holder
    }
  });
  return holder.value ?? authorError(`${path} did not compile`);
}
function compileValueSchema(input, path) {
  const holder = {};
  runSchemaCompiler({
    kind: "value",
    input,
    path,
    allowRequired: false,
    destination: {
      kind: "root",
      holder
    }
  });
  return holder.value ?? authorError(`${path} did not compile`);
}
function valueSchemaSpecToJsonSchema(spec) {
  const schema = compileValueSchema(spec, "schema");
  assertSupportedJsonSchema(schema);
  return schema;
}
function parameterSchemaSpecToJsonSchema(spec) {
  const compiled = compilePropertyMap(spec, "parameters");
  const schema = {
    type: "object",
    properties: compiled.properties,
    ...compiled.required === void 0 ? {} : { required: compiled.required }
  };
  assertSupportedJsonSchema(schema);
  return schema;
}
var ToolArgsError = class extends HarnessError {
  /** Individual violations in schema-walk order. */
  violations;
  constructor(violations) {
    super(`invalid arguments: ${violations.join("; ")}`, "INVALID_ARGS");
    this.name = "ToolArgsError";
    this.violations = violations;
  }
};
function defineTool(options) {
  const userExecute = options.execute;
  const userFinalizeContent = options.finalizeContent;
  const userRender = options.output.render;
  const userPresentationMeta = options.output.presentationMeta;
  const userPresentCall = options.presentCall;
  const userPresentResult = options.presentResult;
  const userIsConcurrencySafe = options.isConcurrencySafe;
  if (options.timeoutMs !== void 0 && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error(`defineTool(${options.name}): timeoutMs must be a positive finite number`);
  const parameters = parameterSchemaSpecToJsonSchema(options.parameters);
  const outputSchema = valueSchemaSpecToJsonSchema(options.output.schema);
  const validate = (args) => validateJsonSchemaValue(parameters, args, "");
  const tool = {
    name: options.name,
    description: options.description,
    parameters,
    output: {
      schema: outputSchema,
      render(args, value) {
        return userRender(args, value);
      },
      ...userPresentationMeta !== void 0 ? { presentationMeta(args, value) {
        return userPresentationMeta(args, value);
      } } : {}
    },
    ...options.timeoutMs !== void 0 ? { timeoutMs: options.timeoutMs } : {},
    async execute(args, exec) {
      const violations = validate(args);
      if (violations.length > 0) throw new ToolArgsError(violations);
      return userExecute(args, exec);
    }
  };
  if (userFinalizeContent) tool.finalizeContent = (exec, result) => userFinalizeContent(exec, result);
  if (userPresentCall) tool.presentCall = (args) => {
    if (validate(args).length > 0) return void 0;
    return userPresentCall(args);
  };
  if (userPresentResult) tool.presentResult = (args, result) => {
    if (validate(args).length > 0) return void 0;
    return userPresentResult(args, result);
  };
  if (userIsConcurrencySafe) tool.isConcurrencySafe = (args) => {
    if (validate(args).length > 0) return false;
    return userIsConcurrencySafe(args);
  };
  return tool;
}
var RUN_CODE_NAME = "run_code";
var TYPESCRIPT_FLAVOR = {
  description: "Execute a TypeScript program against the available tools. Takes two required arguments: `code`, the BODY of an async function (erasable syntax only; top-level `await` and `return` work), and `description`, a short summary of what the program does. Call tools as `await tools.name(args)` per the declarations in the system prompt. Only what you print or return is program output \u2014 curate it. Image-bearing subtool results are attached after the run.",
  codeDescription: "The program: the body of an async TypeScript function."
};
var RUN_CODE_FLAVORS = {
  typescript: TYPESCRIPT_FLAVOR,
  python: {
    description: "Execute a Python program against the available tools. Takes two required arguments: `code`, the BODY of an async function (top-level `await` and `return` work), and `description`, a short summary of what the program does. Call tools as `await tools.name(args)` per the declarations in the system prompt. Use `print(...)` and/or `return <value>` for program output \u2014 curate it. Image-bearing subtool results are attached after the run.",
    codeDescription: "The program: the body of an async Python function."
  }
};
var RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION = 'Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: "Count TODO markers across packages"; "Read failing test and its fixture"; "Rename config key in every cordis.yml".';
function resolveFlavor(peekRuntime) {
  const runtime = peekRuntime();
  if (runtime === void 0) return TYPESCRIPT_FLAVOR;
  const flavor = RUN_CODE_FLAVORS[runtime.language];
  if (!Object.hasOwn(RUN_CODE_FLAVORS, runtime.language) || flavor === void 0) {
    const known = Object.keys(RUN_CODE_FLAVORS).map((name2) => JSON.stringify(name2)).join(", ");
    throw new Error(`dsh-tools: no run_code schema flavor registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`);
  }
  return flavor;
}
var CodeRunFailedError = class extends HarnessError {
  constructor(message) {
    super(message, "CODE_RUN_FAILED");
    this.name = "CodeRunFailedError";
  }
};
function jsonNormalizeArgs(value) {
  let snapshot;
  try {
    snapshot = snapshotJsonValue(value);
  } catch (error) {
    throw new Error(`tool arguments must be lossless JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (snapshot === void 0) throw new Error("tool arguments must be lossless JSON (call the tool with an arguments object, e.g. `{}`)");
  const logged = snapshotJsonValue(snapshot);
  if (logged === void 0) throw new Error("tool arguments could not be detached for durable logging");
  return {
    dispatched: snapshot,
    logged
  };
}
var JSON_INDENT = "  ";
var MAX_JSON_INDENT_CHARS = 10;
function renderJsonValue(value) {
  const chunks = [];
  const tasks = [{
    kind: "value",
    value,
    depth: 0,
    compact: false
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "text") {
      chunks.push(task.text);
      continue;
    }
    const current = task.value;
    if (current === null || typeof current === "boolean" || typeof current === "number") {
      chunks.push(String(current));
      continue;
    }
    if (typeof current === "string") {
      chunks.push(JSON.stringify(current));
      continue;
    }
    const compact = task.compact || (task.depth + 1) * 2 > MAX_JSON_INDENT_CHARS;
    const childDepth = task.depth + 1;
    if (Array.isArray(current)) {
      chunks.push("[");
      if (current.length === 0) {
        chunks.push("]");
        continue;
      }
      tasks.push({
        kind: "text",
        text: compact ? "]" : `
${JSON_INDENT.repeat(task.depth)}]`
      });
      for (let index = current.length - 1; index >= 0; index--) {
        const item = current[index];
        if (item === void 0) throw new Error("cannot render a sparse JSON array");
        tasks.push({
          kind: "value",
          value: item,
          depth: childDepth,
          compact
        });
        tasks.push({
          kind: "text",
          text: compact ? index === 0 ? "" : "," : `${index === 0 ? "\n" : ",\n"}${JSON_INDENT.repeat(childDepth)}`
        });
      }
      continue;
    }
    const keys = Object.keys(current);
    chunks.push("{");
    if (keys.length === 0) {
      chunks.push("}");
      continue;
    }
    tasks.push({
      kind: "text",
      text: compact ? "}" : `
${JSON_INDENT.repeat(task.depth)}}`
    });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) throw new Error("cannot render a missing JSON object key");
      const item = current[key];
      if (item === void 0) throw new Error("cannot render an undefined JSON object property");
      tasks.push({
        kind: "value",
        value: item,
        depth: childDepth,
        compact
      });
      tasks.push({
        kind: "text",
        text: compact ? `${index === 0 ? "" : ","}${JSON.stringify(key)}:` : `${index === 0 ? "\n" : ",\n"}${JSON_INDENT.repeat(childDepth)}${JSON.stringify(key)}: `
      });
    }
  }
  return chunks.join("");
}
function renderValue(value) {
  return typeof value === "string" ? value : renderJsonValue(value);
}
function createRunCodeTool(registry, options) {
  const { requireRuntime, peekRuntime, maxParallel, shapeDispatchLog } = options;
  const definition = defineTool({
    name: RUN_CODE_NAME,
    description: TYPESCRIPT_FLAVOR.description,
    parameters: {
      code: {
        type: "string",
        required: true,
        description: TYPESCRIPT_FLAVOR.codeDescription
      },
      description: {
        type: "string",
        required: true,
        description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          logs: {
            type: "array",
            required: true,
            items: { type: "string" }
          },
          result: { type: "json" }
        }
      },
      render: (_args, value) => {
        const rendered = value.result === void 0 ? "" : renderValue(value.result);
        const parts = [value.logs.join("\n"), rendered].filter((part) => part.length > 0);
        return [{
          type: "text",
          text: parts.length > 0 ? parts.join("\n") : "(run_code completed with no output)"
        }];
      }
    },
    async execute(args, exec) {
      if (args.description.trim().length === 0) throw new Error("invalid description: expected a non-empty string");
      const runtime = requireRuntime();
      const runController = new AbortController();
      const onOuterAbort = () => {
        runController.abort(exec.signal.reason);
      };
      exec.signal.addEventListener("abort", onOuterAbort, { once: true });
      let dispatches = 0;
      const pendingQueue = [];
      const inFlight = /* @__PURE__ */ new Set();
      const logWork = /* @__PURE__ */ new Set();
      const commitQueue = [];
      let exclusiveActive = false;
      let driving = false;
      let driverRun = Promise.resolve();
      let wake;
      const wakeup = () => {
        const release = wake;
        wake = void 0;
        release?.();
      };
      const drive = () => {
        if (driving) return driverRun;
        driving = true;
        driverRun = (async () => {
          try {
            for (; ; ) {
              const signal = new Promise((resolve2) => {
                wake = resolve2;
              });
              const commitHead = commitQueue[0];
              if (commitHead !== void 0 && commitHead.settled) {
                commitQueue.shift();
                await commitHead.commit();
                if (commitHead.mode === "exclusive") exclusiveActive = false;
                continue;
              }
              const head = pendingQueue[0];
              if (head !== void 0) {
                if (runController.signal.aborted) {
                  pendingQueue.shift();
                  head.abandon();
                  continue;
                }
                const mode = head.classify();
                if (!exclusiveActive && (mode === "exclusive" ? inFlight.size === 0 : inFlight.size < maxParallel)) {
                  if (mode === "exclusive") exclusiveActive = true;
                  head.mode = mode;
                  pendingQueue.shift();
                  commitQueue.push(head);
                  await head.start();
                  const flight = head.flight.finally(() => {
                    inFlight.delete(flight);
                    wakeup();
                  });
                  inFlight.add(flight);
                  continue;
                }
              }
              if (pendingQueue.length === 0 && commitQueue.length === 0 && inFlight.size === 0) return;
              await signal;
            }
          } finally {
            driving = false;
            wake = void 0;
          }
        })();
        return driverRun;
      };
      const drainDispatches = async () => {
        await drive();
        while (logWork.size > 0) await Promise.allSettled([...logWork]);
      };
      const runOver = () => runController.signal.aborted;
      const binding = (name2) => async (rawArgs) => {
        if (runOver()) throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} not dispatched`);
        const normalized = jsonNormalizeArgs(rawArgs);
        const n = ++dispatches;
        const subCallId = brandString(`${String(exec.callId)}:ptc:${n}`);
        const input = {
          callId: subCallId,
          rootCallId: exec.rootCallId,
          name: name2,
          arguments: normalized.dispatched,
          ...exec.agent ? { agent: exec.agent } : {},
          parent: exec.token,
          signal: runController.signal
        };
        const scheduler = registry[TOOL_RUNTIME_SCHEDULER];
        const outcome = await new Promise((resolve2, reject) => {
          let parked;
          const settle = (result) => {
            resolve2(result.isError ? {
              isError: true,
              message: result.error.message
            } : {
              isError: false,
              value: result.value
            });
            const agent = exec.agent;
            if (agent === void 0) return;
            const task = (async () => {
              const logged = await shapeDispatchLog({
                exec,
                agent,
                subCallId,
                name: name2,
                isError: result.isError,
                content: result.content
              });
              agent.session.append("tool/ptc-dispatch", {
                rootCallId: exec.rootCallId,
                parentCallId: exec.callId,
                subCallId,
                name: name2,
                arguments: normalized.logged,
                isError: result.isError,
                content: logged
              });
            })().finally(() => {
              logWork.delete(task);
            });
            logWork.add(task);
          };
          pendingQueue.push({
            flight: Promise.resolve(),
            settled: false,
            classify: () => registry.executionMode(input).kind,
            abandon: () => {
              reject(/* @__PURE__ */ new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} tool call abandoned`));
            },
            async start() {
              exec.agent?.session.append("tool/ptc-dispatch-start", {
                rootCallId: exec.rootCallId,
                parentCallId: exec.callId,
                subCallId,
                name: name2,
                arguments: normalized.logged
              });
              const prepared = await scheduler.prepare(input);
              if (prepared.kind === "dispatch") {
                this.flight = scheduler.dispatch(prepared.exec).then((dispatchOutcome) => {
                  parked = {
                    kind: dispatchOutcome.kind,
                    exec: prepared.exec,
                    result: dispatchOutcome.result
                  };
                  this.settled = true;
                });
                return;
              }
              parked = {
                kind: prepared.kind,
                exec: prepared.exec,
                result: prepared.result
              };
              this.settled = true;
            },
            async commit() {
              if (parked === void 0) return;
              const result = parked.kind === "post-result" ? await scheduler.finalize(parked.exec, parked.result) : scheduler.finish(parked.exec, parked.result);
              if (!result.isError && result.content.some((block) => block.type === "image")) exec.deferContext(createUserMessage2({
                content: result.content,
                source: {
                  kind: "plugin",
                  plugin: "tools-ptc"
                }
              }));
              for (const context of result.additionalContexts ?? []) exec.deferContext(context);
              if (result.concludesTurn) exec.concludeTurn();
              settle(result);
              while (logWork.size > maxParallel) await Promise.race(logWork);
            }
          });
          wakeup();
          drive();
        });
        if (runOver()) throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name2} result discarded`);
        if (outcome.isError) throw new Error(outcome.message);
        return outcome.value;
      };
      const functions = /* @__PURE__ */ Object.create(null);
      for (const schema of registry.schemas(exec.agent)) {
        if (schema.name === "run_code") continue;
        Object.defineProperty(functions, schema.name, {
          enumerable: true,
          value: binding(schema.name)
        });
      }
      try {
        let result;
        try {
          result = await runtime.run({
            program: args.code,
            bindings: [{
              global: "tools",
              functions,
              errorClass: {
                name: "ToolCallError",
                memberNameProperty: "toolName"
              }
            }],
            signal: runController.signal
          });
        } finally {
          runController.abort("run_code settled");
          await drainDispatches();
        }
        if (result.error) {
          const logsText = result.logs.length > 0 ? `
Captured output:
${result.logs.join("\n")}` : "";
          throw new CodeRunFailedError(`code run failed (${result.error.kind}): ${result.error.message}${logsText}`);
        }
        return {
          logs: result.logs,
          ...result.value !== void 0 ? { result: result.value } : {}
        };
      } finally {
        exec.signal.removeEventListener("abort", onOuterAbort);
      }
    },
    presentCall: (args) => ({
      card: "generic",
      title: args.description,
      kind: "execute",
      rawInput: args.code
    })
  });
  Object.defineProperty(definition, "description", {
    enumerable: true,
    get: () => resolveFlavor(peekRuntime).description
  });
  Object.defineProperty(definition, "parameters", {
    enumerable: true,
    get: () => parameterSchemaSpecToJsonSchema({
      code: {
        type: "string",
        required: true,
        description: resolveFlavor(peekRuntime).codeDescription
      },
      description: {
        type: "string",
        required: true,
        description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
      }
    })
  });
  return definition;
}
var IDENTIFIER$1 = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function renderKey(name2) {
  return IDENTIFIER$1.test(name2) ? name2 : JSON.stringify(name2);
}
function pad$1(indent) {
  return "  ".repeat(indent);
}
function docLines$1(description, indent) {
  if (typeof description !== "string" || description.length === 0) return [];
  const collapsed = description.replace(/\s+/g, " ").trim();
  return [`${pad$1(indent)}/** ${collapsed.replaceAll("*/", String.raw`*\/`)} */`];
}
function renderScalar(value) {
  return JSON.stringify(value);
}
function renderConstrainedScalar$1(node, type) {
  const broad = type === "integer" ? "number" : type;
  if (Object.hasOwn(node, "const")) return renderScalar(node.const);
  if (Object.hasOwn(node, "enum")) return node.enum.map(renderScalar).join(" | ");
  return broad;
}
function typeDocumentFrom(parts) {
  return {
    parts,
    containsUnionOrIntersection: parts.some((part) => typeof part === "string" ? part.includes("|") || part.includes("&") : part.containsUnionOrIntersection)
  };
}
function typeDocument(...parts) {
  return typeDocumentFrom(parts);
}
function flattenTypeDocument(document) {
  const chunks = [];
  const tasks = [document];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (typeof task === "string") {
      chunks.push(task);
      continue;
    }
    for (let index = task.parts.length - 1; index >= 0; index--) {
      const part = task.parts[index];
      if (part !== void 0) tasks.push(part);
    }
  }
  return chunks.join("");
}
function schemaRenderFrame(node, indent) {
  return {
    node,
    indent,
    phase: "start",
    children: [],
    childIndex: 0,
    childDocuments: [],
    entries: []
  };
}
function renderSupportedSchema(schema, indent) {
  const frames = [schemaRenderFrame(schema, indent)];
  let rootDocument;
  const finish = (document) => {
    frames.pop();
    const parent = frames.at(-1);
    if (parent === void 0) rootDocument = document;
    else parent.childDocuments.push(document);
  };
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === void 0) break;
    if (frame.phase === "children") {
      if (frame.childIndex < frame.children.length) {
        const child = frame.children[frame.childIndex];
        if (child === void 0) throw new Error("missing schema render child");
        frame.childIndex++;
        frames.push(schemaRenderFrame(child.node, child.indent));
        continue;
      }
      if (frame.kind === "oneOf") {
        const parts2 = [];
        for (let index = 0; index < frame.childDocuments.length; index++) {
          if (index > 0) parts2.push(" | ");
          const child = frame.childDocuments[index];
          if (child !== void 0) parts2.push(child);
        }
        finish(typeDocumentFrom(parts2));
        continue;
      }
      if (frame.kind === "array") {
        const child = frame.childDocuments[0];
        if (child === void 0) throw new Error("missing array item type");
        finish(child.containsUnionOrIntersection ? typeDocument("(", child, ")[]") : typeDocument(child, "[]"));
        continue;
      }
      const required = new Set(frame.node.required);
      const parts = ["{"];
      for (let index = 0; index < frame.entries.length; index++) {
        const entry = frame.entries[index];
        const child = frame.childDocuments[index];
        if (entry === void 0 || child === void 0) throw new Error("missing object property type");
        const [name2, prop] = entry;
        for (const line of docLines$1(prop.description, frame.indent + 1)) parts.push("\n", line);
        parts.push("\n", `${pad$1(frame.indent + 1)}${renderKey(name2)}${required.has(name2) ? "" : "?"}: `, child, ";");
      }
      parts.push("\n", `${pad$1(frame.indent)}}`);
      const declared = typeDocumentFrom(parts);
      finish(frame.node.additionalProperties === false ? declared : typeDocument(declared, " & Record<string, JsonValue>"));
      continue;
    }
    const node = frame.node;
    if (node.oneOf !== void 0) {
      frame.kind = "oneOf";
      frame.children = Array.from(node.oneOf, (child) => ({
        node: child,
        indent: frame.indent
      }));
      frame.childIndex = 0;
      frame.childDocuments = [];
      frame.phase = "children";
      continue;
    }
    if (node.type === void 0) {
      finish(typeDocument("JsonValue"));
      continue;
    }
    switch (node.type) {
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null":
        finish(typeDocument(renderConstrainedScalar$1(node, node.type)));
        break;
      case "array":
        if (node.items === void 0) finish(typeDocument("JsonValue[]"));
        else {
          frame.kind = "array";
          frame.children = [{
            node: node.items,
            indent: frame.indent
          }];
          frame.childIndex = 0;
          frame.childDocuments = [];
          frame.phase = "children";
        }
        break;
      case "object": {
        const open = node.additionalProperties !== false;
        const entries = Object.entries(node.properties ?? {});
        if (entries.length === 0) finish(typeDocument(open ? "Record<string, JsonValue>" : "Record<string, never>"));
        else {
          frame.kind = "object";
          frame.entries = entries;
          frame.children = entries.map(([, child]) => ({
            node: child,
            indent: frame.indent + 1
          }));
          frame.childIndex = 0;
          frame.childDocuments = [];
          frame.phase = "children";
        }
        break;
      }
      /* v8 ignore next -- assertSupportedJsonSchema narrowed this closed type union. */
      default:
        finish(typeDocument("unknown"));
    }
  }
  return rootDocument ?? typeDocument("unknown");
}
function jsonSchemaToTs(schema, indent = 0) {
  try {
    assertSupportedJsonSchema(schema);
    return flattenTypeDocument(renderSupportedSchema(schema, indent));
  } catch {
    return "unknown";
  }
}
var SDK_INSTRUCTIONS$1 = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` \u2014 the body of an async TypeScript function (erasable syntax only \u2014 no \`enum\` or namespaces; type annotations are advisory, the code runs type-stripped) \u2014 and \`description\`, a short summary of what the program does. The declarations below are SDK bindings for this program. A declaration does not make its name a directly callable tool; only names supplied as separate tool schemas may be called directly.`;
var SDK_PROGRAM_INSTRUCTIONS = `Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 quoted access for exotic names: \`tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose \`message\` is human-readable \u2014 \`try/catch\` it to handle and continue.
- Independent read-only calls MAY overlap under \`Promise.all\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit results with \`return\` and/or \`console.log(...)\`. Only what you print or return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

Program-only SDK bindings:`;
function acceptsExampleString(schema, value) {
  return schema?.type === "string" && (schema.const === void 0 || schema.const === value) && (schema.enum === void 0 || schema.enum.includes(value));
}
function renderBashExample(schemas) {
  const bash = schemas.find((schema) => schema.name === "bash");
  if (bash === void 0) return "";
  const parameters = bash.parameters;
  if (parameters.type !== "object") return "";
  const required = parameters.required ?? [];
  if (required.some((name2) => name2 !== "command" && name2 !== "description")) return "";
  if (!acceptsExampleString(parameters.properties?.command, "pwd")) return "";
  const needsDescription = required.includes("description");
  if (needsDescription && !acceptsExampleString(parameters.properties?.description, "Show current directory")) return "";
  return ` When no separate \`bash\` schema is supplied, invoke a declared \`bash\` binding inside \`run_code\`:

\`run_code({ code: "return await tools.bash({ command: 'pwd'${needsDescription ? ", description: 'Show current directory'" : ""} })", description: "Show current directory" })\``;
}
function renderToolsSdk(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const argsMembers = [];
  const outputMembers = [];
  for (const schema of sorted) {
    argsMembers.push(...docLines$1(schema.description, 1));
    argsMembers.push(`${pad$1(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.parameters, 1)};`);
    outputMembers.push(`${pad$1(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.output, 1)};`);
  }
  const declaration = [
    `interface ToolArgsMap {${argsMembers.length > 0 ? `
${argsMembers.join("\n")}
` : ""}}`,
    `interface ToolOutputMap {${outputMembers.length > 0 ? `
${outputMembers.join("\n")}
` : ""}}`,
    "type ToolName = keyof ToolOutputMap",
    [
      "declare class ToolCallError extends Error {",
      '  readonly name: "ToolCallError";',
      "  readonly toolName: ToolName;",
      "}"
    ].join("\n"),
    [
      "declare const tools: {",
      "  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;",
      "}"
    ].join("\n")
  ].join("\n\n");
  return `${SDK_INSTRUCTIONS$1}${renderBashExample(sorted)}

${SDK_PROGRAM_INSTRUCTIONS}

\`\`\`ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

${declaration}
\`\`\``;
}
var IDENTIFIER = /^[\p{XID_Start}_]\p{XID_Continue}*$/u;
function isBareIdentifier(name2) {
  return IDENTIFIER.test(name2) && name2.normalize("NFKC") === name2;
}
var RESERVED = /* @__PURE__ */ new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  "__debug__"
]);
var TYPING_ORDER = [
  "Any",
  "Literal",
  "NotRequired",
  "Protocol",
  "TypedDict"
];
function pad(indent) {
  return "    ".repeat(indent);
}
var UNPRINTABLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g;
var LONE_SURROGATE = /[\ud800-\udfff]/gu;
function describe2(schema) {
  const description = schema.description;
  if (typeof description !== "string") return void 0;
  const collapsed = description.replace(/\s+/g, " ").replace(UNPRINTABLE, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`).replace(LONE_SURROGATE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).trim();
  return collapsed.length === 0 ? void 0 : collapsed;
}
function docLines(description, indent) {
  const collapsed = describe2({ description });
  if (collapsed === void 0) return [];
  const escaped = collapsed.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return [`${pad(indent)}"""${escaped}"""`];
}
function camelCase(raw) {
  const joined = raw.split(/[^\p{XID_Continue}]+|_+/u).filter((part) => part.length > 0).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join("").normalize("NFKC");
  return (/^\p{XID_Start}/u.test(joined) ? joined : `Tool${joined}`).normalize("NFKC");
}
var MAX_CLASS_NAME_BASE = 120;
var MAX_LIST_NESTING = 180;
function capClassNameBase(base) {
  if (base.length <= MAX_CLASS_NAME_BASE) return base;
  const capped = base.slice(0, MAX_CLASS_NAME_BASE);
  return /[\uD800-\uDBFF]$/.test(capped) ? capped.slice(0, -1) : capped;
}
function allocateClassName(base, state) {
  const capped = capClassNameBase(base);
  let name2 = capped;
  if (state.usedClassNames.has(name2)) {
    let n = state.nextClassCounter.get(capped) ?? 2;
    while (state.usedClassNames.has(`${capped}${n}`)) n++;
    name2 = `${capped}${n}`;
    state.nextClassCounter.set(capped, n + 1);
  }
  state.usedClassNames.add(name2);
  return name2;
}
function childClassName(base, segment) {
  return capClassNameBase(`${base}${segment}`.normalize("NFKC"));
}
function pyScalar(value) {
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) return BigInt(value).toString();
  return String(value);
}
function renderConstrainedScalar(node, broad, state) {
  if (node.const !== void 0) {
    state.typing.add("Literal");
    return `Literal[${pyScalar(node.const)}]`;
  }
  if (node.enum !== void 0) {
    state.typing.add("Literal");
    return `Literal[${node.enum.map(pyScalar).join(", ")}]`;
  }
  return broad;
}
function renderType(schema, className, state) {
  const newFrame = (schema2, className2, listDepth) => ({
    schema: schema2,
    className: className2,
    phase: "start",
    listDepth,
    children: [],
    childIndex: 0,
    childTypes: [],
    entries: []
  });
  try {
    assertSupportedJsonSchema(schema);
    const frames = [newFrame(schema, className, 0)];
    let result;
    const finish = (type) => {
      frames.pop();
      const parent = frames.at(-1);
      if (parent === void 0) result = type;
      else parent.childTypes.push(type);
    };
    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (frame === void 0) break;
      if (frame.phase === "children") {
        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex];
          if (child === void 0) throw new Error("missing python render child");
          frame.childIndex++;
          frames.push(newFrame(child.schema, child.className, child.listDepth));
          continue;
        }
        if (frame.kind === "oneOf") {
          let union = "";
          for (const [index, childType] of frame.childTypes.entries()) union = index === 0 ? childType : `${union} | ${childType}`;
          finish(union);
          continue;
        }
        if (frame.kind === "array") {
          finish(`list[${frame.childTypes[0] ?? "Any"}]`);
          continue;
        }
        const node2 = frame.node;
        const name2 = frame.allocated;
        if (node2 === void 0 || name2 === void 0) throw new Error("missing typeddict frame state");
        const required = new Set(node2.required);
        const lines = [`class ${name2}(TypedDict):`];
        for (let index = 0; index < frame.entries.length; index++) {
          const entry = frame.entries[index];
          const fieldType = frame.childTypes[index];
          if (entry === void 0 || fieldType === void 0) throw new Error("missing typeddict field type");
          const [field, fieldSchema] = entry;
          const description = describe2(fieldSchema);
          if (description !== void 0) lines.push(`${pad(1)}# ${description}`);
          if (required.has(field)) lines.push(`${pad(1)}${field}: ${fieldType}`);
          else {
            state.typing.add("NotRequired");
            lines.push(`${pad(1)}${field}: NotRequired[${fieldType}]`);
          }
        }
        if (node2.additionalProperties !== false) lines.push(`${pad(1)}# Additional keys beyond those declared are allowed.`);
        if (lines.length === 1) lines.push(`${pad(1)}pass`);
        state.classes.push(lines.join("\n"));
        finish(name2);
        continue;
      }
      frame.phase = "children";
      const node = frame.schema;
      if (node.oneOf !== void 0) {
        frame.kind = "oneOf";
        frame.children = node.oneOf.map((branch, index) => ({
          schema: branch,
          className: childClassName(frame.className, `${index + 1}`),
          listDepth: frame.listDepth
        }));
        continue;
      }
      if (node.type === void 0) {
        state.typing.add("Any");
        finish("Any");
        continue;
      }
      switch (node.type) {
        case "string":
          finish(renderConstrainedScalar(node, "str", state));
          break;
        case "number":
          finish(renderConstrainedScalar(node, "float", state));
          break;
        case "integer":
          finish(renderConstrainedScalar(node, "int", state));
          break;
        case "boolean":
          finish(renderConstrainedScalar(node, "bool", state));
          break;
        case "null":
          finish("None");
          break;
        case "array":
          if (node.items === void 0) {
            state.typing.add("Any");
            finish("list[Any]");
            break;
          }
          if (frame.listDepth >= MAX_LIST_NESTING) {
            state.typing.add("Any");
            finish("Any");
            break;
          }
          frame.kind = "array";
          frame.children = [{
            schema: node.items,
            className: frame.className,
            listDepth: frame.listDepth + 1
          }];
          break;
        case "object": {
          const entries = Object.entries(node.properties ?? {});
          if (className === "" || !entries.every(([name2]) => isBareIdentifier(name2) && !RESERVED.has(name2) && !(name2.startsWith("__") && !name2.endsWith("__")))) {
            state.typing.add("Any");
            finish("dict[str, Any]");
            break;
          }
          if (entries.length === 0 && node.additionalProperties !== false) {
            state.typing.add("Any");
            finish("dict[str, Any]");
            break;
          }
          frame.kind = "typeddict";
          frame.node = node;
          frame.allocated = allocateClassName(frame.className, state);
          state.typing.add("TypedDict");
          frame.entries = entries;
          frame.children = entries.map(([field, child]) => ({
            schema: child,
            className: childClassName(frame.allocated ?? "", camelCase(field)),
            listDepth: 1
          }));
          break;
        }
        /* v8 ignore next 4 -- assertSupportedJsonSchema narrowed this closed type union. */
        default:
          state.typing.add("Any");
          finish("Any");
      }
    }
    return result ?? "Any";
  } catch {
    state.typing.add("Any");
    return "Any";
  }
}
var SDK_INSTRUCTIONS = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` \u2014 the body of an async Python function (top-level \`await\` and \`return\` both work) \u2014 and \`description\`, a short summary of what the program does. At run time exactly two of the names declared below are bound: \`tools\` and \`ToolCallError\`. Everything else is a STATIC STUB describing argument and return types \u2014 in particular the \`TypedDict\` classes do NOT exist at run time, so build arguments as plain \`dict\`/\`list\` JSON values: \`await tools.name({"field": 1})\`, never \`FooArgs(field=1)\`, which raises \`NameError\`. Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 subscript access for exotic, reserved, or underscore-leading names: \`await tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value (each method's return type below). Tool arguments must be lossless JSON.
- A FAILED tool call raises \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose message is human-readable \u2014 wrap in \`try/except\` to handle and continue.
- Independent read-only calls MAY overlap under \`asyncio.gather\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit the run's answer with \`print(...)\` and/or a top-level \`return <value>\`; the returned value must be lossless JSON. Only what you print and return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

The available tools:`;
function renderToolsSdkPy(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const state = {
    classes: [],
    usedClassNames: /* @__PURE__ */ new Set(),
    nextClassCounter: /* @__PURE__ */ new Map(),
    typing: /* @__PURE__ */ new Set(["Protocol"])
  };
  const members = [];
  let statements = 0;
  for (const schema of sorted) {
    const argType = renderType(schema.parameters, `${camelCase(schema.name)}Args`, state);
    const outputType = renderType(schema.output, `${camelCase(schema.name)}Output`, state);
    if (isBareIdentifier(schema.name) && !RESERVED.has(schema.name) && !schema.name.startsWith("_")) {
      const doc = docLines(schema.description, 2);
      members.push(doc.length > 0 ? `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}:` : `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}: ...`);
      members.push(...doc);
      statements += 1;
    } else {
      members.push(`${pad(1)}# tools[${JSON.stringify(schema.name)}](args: ${argType}) -> ${outputType}`);
      const description = describe2(schema);
      if (description !== void 0) members.push(`${pad(1)}#   ${description}`);
    }
  }
  const body = (statements > 0 ? members : [`${pad(1)}pass`, ...members]).join("\n");
  const imports = TYPING_ORDER.filter((symbol) => state.typing.has(symbol));
  const classBlock = state.classes.length > 0 ? `${state.classes.join("\n\n")}

` : "";
  return `${SDK_INSTRUCTIONS}

\`\`\`python
${`from typing import ${imports.join(", ")}

class ToolCallError(Exception):
    toolName: str

${classBlock}class Tools(Protocol):
${body}

tools: Tools`}
\`\`\``;
}
var PTC_ONLY_INSTRUCTION = `\`${RUN_CODE_NAME}\` is the only tool you can call directly \u2014 a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.`;
var SDK_RENDERERS = {
  typescript: renderToolsSdk,
  python: renderToolsSdkPy
};
var TOOL_RUNTIME_SCHEDULER = Symbol("@deepseek-ai/dsh-tools.scheduler");
var TOOL_ABORTED = "ABORTED";
var TOOL_ABORTED_BEFORE_DISPATCH = "ABORTED_BEFORE_DISPATCH";
var ToolNotFoundError = class extends HarnessError {
  /**
  * @param toolName - the name the caller asked for.
  * @param reachableFrom - how the model reaches this tool instead, when the
  *   name IS visible and only the presentation denies calling it directly.
  *   Omitted for a name that is registered nowhere.
  */
  constructor(toolName, reachableFrom) {
    super(reachableFrom === void 0 ? `unknown tool "${toolName}"` : `unknown tool "${toolName}": ${reachableFrom}`, "UNKNOWN_TOOL");
    this.name = "ToolNotFoundError";
  }
};
var ToolOutputError = class extends HarnessError {
  /** Schema/value violations in validation order. */
  violations;
  constructor(toolName, violations) {
    super(`tool "${toolName}" returned invalid output: ${violations.join("; ")}`, "INVALID_TOOL_OUTPUT");
    this.name = "ToolOutputError";
    this.violations = violations;
  }
};
function projectionError(toolName, projector, error) {
  return new ToolOutputError(toolName, [`output.${projector} failed: ${errorMessage(error)}`]);
}
function snapshotProjection(toolName, projector, candidate) {
  try {
    const detached = snapshotJsonValue(candidate);
    if (detached === void 0) throw new ToolOutputError(toolName, [`output.${projector} returned non-lossless JSON`]);
    return detached;
  } catch (error) {
    if (error instanceof ToolOutputError) throw error;
    throw projectionError(toolName, projector, error);
  }
}
function snapshotToolValue(toolName, candidate) {
  try {
    const detached = snapshotJsonValue(candidate);
    if (detached === void 0) throw new ToolOutputError(toolName, ["value is not lossless JSON"]);
    return detached;
  } catch (error) {
    if (error instanceof ToolOutputError) throw error;
    throw new ToolOutputError(toolName, [`value snapshot failed: ${errorMessage(error)}`]);
  }
}
function errorMessage(error) {
  try {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
    return String(error);
  } catch {
    return "<unprintable thrown value>";
  }
}
function failureMessageFromContent(content) {
  const text = content.map((block) => block.type === "text" ? block.text : `[${block.type} content]`).join("\n");
  return text.length > 0 ? text : "tool result blocked by post-execute policy";
}
function materializePresentation(candidate) {
  const detached = snapshotJsonValue(candidate);
  if (detached === void 0) throw new TypeError("tool result must be losslessly JSON-serializable");
  return deepFreeze(detached);
}
function errorInfo(error) {
  try {
    return error instanceof HarnessError ? {
      name: error.name,
      code: error.code
    } : void 0;
  } catch {
    return;
  }
}
var ToolLayer = class {
  tools;
  restrictions = new AnonymousEntries();
  guards = new AnonymousEntries();
  /**
  * Presentation this scope's agent declared for itself, shadowing the
  * deployment default. One cell rather than an entry table: two answers to
  * "which form does the model see" is a contradiction, not a merge.
  */
  mode;
  constructor(scope) {
    this.tools = new NamedEntries((name2) => /* @__PURE__ */ new Error(scope === void 0 ? `tool "${name2}" is already registered (for a per-agent variant, register through that agent's \`agent.ctx\` instead)` : `tool "${name2}" is already registered in this scope`));
  }
  /** Whether every contribution table in this aggregate layer is empty. */
  isEmpty() {
    return this.tools.isEmpty() && this.restrictions.isEmpty() && this.guards.isEmpty() && this.mode === void 0;
  }
  /** Whether every compiled restriction in this layer admits a global tool name. */
  admits(name2) {
    for (const filter of this.restrictions.values()) if (filter.allow !== void 0 && !filter.allow.has(name2) || filter.deny !== void 0 && filter.deny.has(name2)) return false;
    return true;
  }
  /** First monotonic denial from this layer's live guard registrations. */
  guardReason(exec) {
    for (const guard of this.guards.values()) {
      const reason = guard(exec);
      if (reason !== void 0) return reason;
    }
  }
};
function resolveMaxParallelSubCalls(value) {
  const maxParallelSubCalls = value ?? 10;
  if (!Number.isInteger(maxParallelSubCalls) || maxParallelSubCalls < 1) throw new Error("maxParallelSubCalls must be a positive integer");
  return maxParallelSubCalls;
}
var ToolRuntime = class extends Service {
  static inject = ["systemPrompt"];
  static Config = z4.object({
    mode: z4.union([
      "native",
      "ptc",
      "both"
    ]).default("native"),
    maxParallelSubCalls: z4.natural().min(1).default(10)
  });
  /** Internal staged view consumed by `dsh-agent-loop`'s parallel scheduler. */
  [TOOL_RUNTIME_SCHEDULER] = {
    prepare: (exec) => this.prepareScheduledExecution(exec),
    dispatch: (exec) => this.dispatchScheduledExecution(exec),
    finalize: (exec, result) => this.finalizeScheduledExecution(exec, result),
    finish: (exec, result) => this.finishScheduledExecution(exec, result)
  };
  /** Context deferred by a running tool body, keyed by its scheduler-owned execution. */
  deferredContexts = /* @__PURE__ */ new WeakMap();
  /** Executions whose tool body declared the current turn complete. */
  concludingExecutions = /* @__PURE__ */ new WeakSet();
  /** Original caller cancellation, kept outside the wrapper-mutable execution object. */
  cancellationStates = /* @__PURE__ */ new WeakMap();
  /** Definition-owned final content transform snapshotted before policy begins. */
  contentFinalizers = /* @__PURE__ */ new WeakMap();
  layers = new ScopedLayers((scope) => new ToolLayer(scope), () => {
    this.ctx.emit("tools/change");
  });
  /** Presentation for scopes that declare none; {@link presentAs} shadows it per scope. */
  defaultMode;
  maxParallelSubCalls;
  /**
  * Reserved presentation transport, kept outside the filterable registration
  * layers. Built on first need rather than at construction: which agents run
  * a PTC mode is no longer known when the service is constructed, and the
  * transport is stateless beyond its closures over `this`.
  */
  ptcTransport;
  constructor(ctx, config = {}) {
    super(ctx, "tools");
    this.defaultMode = config.mode ?? "native";
    this.maxParallelSubCalls = resolveMaxParallelSubCalls(config.maxParallelSubCalls);
    ctx.systemPrompt.tools((context) => this.wireSchemas(context.scope));
    if (this.defaultMode !== "native") {
      ctx.systemPrompt.section(this.collapseSection());
      ctx.systemPrompt.section(this.sdkSection());
    }
  }
  /**
  * The prompt statement of the `ptc` executor collapse, registered wherever
  * {@link sdkSection} is and rendering empty outside an effective `ptc`.
  *
  * Every tool contributes its own guidance section naming its tool, none of
  * them qualify how that tool is reached, and they all render before the SDK.
  * Without this the model reads a catalog of tools it is told to use and no
  * statement that only `run_code` may be called, so it emits a native call,
  * receives `UNKNOWN_TOOL` for a tool the prompt just declared, and concludes
  * the deployment is inconsistent. Its order places the rule before that
  * guidance rather than after it.
  *
  * `both` renders empty: native calls do execute there, so the rule is false.
  * @returns the section registration.
  */
  collapseSection() {
    return {
      name: "tools:ptc-only",
      order: this.ctx.systemPrompt.getSectionOrder("PTC_ONLY"),
      text: (context) => this.modeFor(context.scope) === "ptc" ? PTC_ONLY_INSTRUCTION : ""
    };
  }
  /**
  * The generated-SDK prompt section, registered globally by a PTC mode
  * deployment and per scope by {@link presentAs}.
  *
  * The body regenerates from the CALLING scope, and renders empty for an
  * agent presenting natively — an agent that opted out under a PTC mode
  * deployment still sees the global registration, and an empty section is
  * dropped from the rendered prompt.
  * @returns the section registration.
  */
  sdkSection() {
    return {
      name: "tools:sdk",
      order: this.ctx.systemPrompt.getSectionOrder("TOOLS_SDK"),
      text: (context) => {
        const mode = this.modeFor(context.scope);
        if (mode === "native") return "";
        const runtime = this.requireCodeRuntime(mode);
        const render = SDK_RENDERERS[runtime.language];
        if (render === void 0) throw new Error(`dsh-tools: no SDK renderer for ${runtime.language}`);
        return render(this.sdkSchemas(context.scope));
      }
    };
  }
  /**
  * The presentation one scope's agent sees: its own declaration, else the
  * deployment default.
  * @param scope - the calling agent, or undefined for the global view.
  * @returns the resolved presentation mode.
  */
  modeFor(scope) {
    const layers = this.layers.chainLayers(scope);
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const mode = layers[index]?.mode;
      if (mode !== void 0) return mode;
    }
    return this.defaultMode;
  }
  /**
  * The reserved `run_code` transport, built on first need.
  *
  * It never enters the global layer: per-agent restrictions must not remove
  * it, and a scoped registration must not shadow it. The visibility resolver
  * appends it after resolving the filterable global/scoped capability layers,
  * and only for scopes whose mode actually presents it.
  * @returns the shared transport definition.
  */
  requireCodeTransport() {
    this.ptcTransport ??= createRunCodeTool(this, {
      requireRuntime: () => this.requireCodeRuntime(this.defaultMode),
      peekRuntime: () => this.ctx.get("codeRuntime"),
      maxParallel: this.maxParallelSubCalls,
      shapeDispatchLog: (dispatch) => this.shapeDispatchLog(dispatch)
    });
    return this.ptcTransport;
  }
  /**
  * Present the calling scope's tools in `mode` instead of the deployment
  * default. Nearest scope on the chain wins, so a preset's standing
  * declaration covers every agent joined under it.
  *
  * Scoped only, and one declaration per scope: this is how an agent preset
  * composes PTC mode agents beside native ones in the same process, and a
  * process-global override would be the `mode` config field instead.
  * @param mode - the presentation the covered agents' models see.
  * @returns the exact disposer that restores the deployment default.
  */
  presentAs(mode) {
    const ctx = this.ctx;
    if (scopeOf(ctx) === void 0) throw new Error("tools.presentAs() requires a scoped context (agent.ctx): a context-global presentation is the `mode` config field on the tools row");
    return ctx.effect(function* () {
      yield this.layers.effect(ctx, (layer) => {
        if (layer.mode !== void 0) throw new Error(`tools.presentAs("${mode}") conflicts with "${layer.mode}" already declared for this scope; one composition selects one presentation`);
        layer.mode = mode;
        return () => {
          layer.mode = void 0;
        };
      }, { label: "tools.presentAs()" });
      if (mode !== "native") {
        yield ctx.systemPrompt.section(this.collapseSection());
        yield ctx.systemPrompt.section(this.sdkSection());
      }
    }.bind(this), "tools.presentAs()");
  }
  /**
  * Build one scope's wire schemas and names for prompt-order validation.
  * Restrictions do not make known tools invalid, but a mode collapse does.
  */
  wireSchemas(scope) {
    const view = this.view(scope);
    const mode = this.modeFor(scope);
    if (mode === "native") return {
      schemas: [...view.visible.values()].map((definition) => this.schemaOf(definition, false)),
      knownNames: [...view.knownNames]
    };
    this.requireCodeRuntime(mode);
    const schemas = [...view.visible.values()].map((definition) => this.schemaOf(definition, false));
    if (mode === "ptc") return {
      schemas: schemas.filter((schema) => schema.name === RUN_CODE_NAME),
      knownNames: [RUN_CODE_NAME]
    };
    return {
      schemas,
      knownNames: [...view.knownNames, RUN_CODE_NAME]
    };
  }
  /**
  * Resolve the code runtime or throw the actionable misconfiguration error.
  * Read at use time (assembly / run_code execution), NOT via static
  * `inject`: an inject entry would hold `ctx.tools` — and every tool plugin
  * behind it — hostage to a code runtime existing even under `mode:
  * 'native'`.
  *
  * Assembly and `run_code` execution read separately, so the language is not
  * bound to a request. Harmless while one published backend exists — both
  * reads return the same flavor — but a reload that swapped in a second
  * language between them would hand a program written against one SDK to the
  * other. Binding it is deferred until a second backend ships (the first
  * point it is testable).
  */
  requireCodeRuntime(mode) {
    const runtime = this.ctx.get("codeRuntime");
    if (!runtime) throw new Error(`dsh-tools: mode "${mode}" requires a code runtime \u2014 load a ctx.codeRuntime implementation (e.g. @deepseek-ai/dsh-code-runtime-worker-thread) or set tools mode to "native"`);
    if (!Object.hasOwn(SDK_RENDERERS, runtime.language)) {
      const known = Object.keys(SDK_RENDERERS).map((name2) => JSON.stringify(name2)).join(", ");
      throw new Error(`dsh-tools: no SDK renderer registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`);
    }
    return runtime;
  }
  /**
  * Register globally or in the calling agent scope. Scoped tools shadow
  * globals; duplicates within one layer and the reserved `run_code` name fail.
  * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
  * @returns the exact disposer that unregisters the tool.
  */
  register(definition) {
    const name2 = definition.name;
    const output = definition.output;
    if (output === void 0 || typeof output !== "object" || typeof output.render !== "function" || output.presentationMeta !== void 0 && typeof output.presentationMeta !== "function") throw new TypeError(`tool "${name2}" must declare output { schema, render, presentationMeta? }`);
    assertSupportedJsonSchema(output.schema);
    const timeoutMs = definition.timeoutMs;
    if (timeoutMs !== void 0 && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new TypeError(`tool "${name2}" timeoutMs must be a positive finite number`);
    if (name2 === "run_code") throw new Error(`tool name "${RUN_CODE_NAME}" is reserved for the PTC mode presentation transport and cannot be registered or shadowed`);
    return this.layers.effect(this.ctx, (layer) => layer.tools.insert(name2, definition), { label: "tools.register()" });
  }
  /**
  * Restrict global tools for the calling agent scope. Empty filters, unknown
  * names, scope-local names, and reserved transport names fail. Restrictions
  * intersect; scoped registrations remain visible.
  * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
  * @returns the exact disposer that lifts this restriction.
  */
  restrict(filter) {
    const scope = scopeOf(this.ctx);
    if (scope === void 0) throw new Error("tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent \u2014 deny the tool for the intended agent instead");
    const allow = filter.allow;
    const deny = filter.deny;
    if (allow === void 0 && deny === void 0) throw new Error("tools.restrict({}) is a no-op: pass `allow` and/or `deny` (an empty filter is almost always a materialized-empty-config bug)");
    const compiled = {
      ...allow !== void 0 ? { allow: new Set(allow) } : {},
      ...deny !== void 0 ? { deny: new Set(deny) } : {}
    };
    if ([...allow ?? [], ...deny ?? []].includes("run_code")) throw new Error(`tools.restrict() cannot name reserved PTC mode presentation transport "${RUN_CODE_NAME}"; restrict end-capability tools instead`);
    const known = this.view(scope).restrictableNames;
    const unknown = [...allow ?? [], ...deny ?? []].filter((name2) => !known.has(name2));
    if (unknown.length > 0) throw new Error(`tools.restrict() names unknown global tool${unknown.length > 1 ? "s" : ""} ${unknown.map((n) => `"${n}"`).join(", ")}; known global tools: ${[...known].sort().join(", ") || "(none)"}`);
    return this.layers.effect(this.ctx, (layer) => layer.restrictions.append(compiled), { label: "tools.restrict()" });
  }
  /**
  * Register a monotonic guard after the extensible `tools/pre-execute`
  * waterfall. A plain-context guard applies globally; one registered through
  * `agent.ctx` applies only to that agent. Any matching guard may deny by
  * returning a reason, while no guard can force-allow a call another guard
  * denied. The exact effect disposer is returned for ordered ownership and
  * HMR cleanup.
  * @param guard - synchronous check; a returned string denies the execution.
  * @returns the exact disposer that unregisters the guard.
  */
  guard(guard) {
    return this.layers.effect(this.ctx, (layer) => layer.guards.append(guard), {
      label: "tools.guard()",
      notify: false
    });
  }
  /** First monotonic denial from the global then the scope chain's guard layers, farthest first. */
  guardReason(exec) {
    const globalReason = this.layers.global.guardReason(exec);
    if (globalReason !== void 0) return globalReason;
    if (exec.agent === void 0) return void 0;
    for (const layer of this.layers.chainLayers(exec.agent)) {
      const reason = layer.guardReason(exec);
      if (reason !== void 0) return reason;
    }
  }
  /**
  * Resolve every registry fact one scope needs in one layer traversal. The
  * visible map applies restrictions to the INHERITED surface, then the
  * scope's own registrations and the reserved presentation transport; the
  * other sets retain the pre-restriction facts needed by restriction and
  * prompt-order validation.
  *
  * A restriction filters what a scope inherits — the global layer and every
  * ancestor layer on its chain — and never what its OWN layer registers.
  * That exemption is what a per-child capability filter has to keep intact:
  * the delegation runtime registers a child's structured-output tool into the
  * child's own layer, and a filter naming the capabilities the child may use
  * must not strip the machinery it answers through.
  *
  * Reading the exempt set as "the global layer" instead of "not mine" held
  * only while every model-facing tool sat in the host composition. Once
  * presets moved them onto the agent plane they became an ANCESTOR
  * contribution, so a child's filter silently stopped constraining anything
  * it was given.
  * @param scope - the viewing scope (the agent), or undefined for the global view.
  * @returns the complete derived view for that scope.
  */
  view(scope) {
    const layers = this.layers.chainLayers(scope);
    const own = this.layers.peek(scope);
    const inherited = new Map(this.layers.global.tools.entries());
    for (const layer of layers) {
      if (layer === own) continue;
      for (const [name2, definition] of layer.tools.entries()) inherited.set(name2, definition);
    }
    const visible = /* @__PURE__ */ new Map();
    const knownNames = /* @__PURE__ */ new Set();
    const restrictableNames = /* @__PURE__ */ new Set();
    for (const [name2, definition] of inherited) {
      knownNames.add(name2);
      restrictableNames.add(name2);
      if (layers.every((layer) => layer.admits(name2))) visible.set(name2, definition);
    }
    if (own !== void 0) for (const [name2, definition] of own.tools.entries()) {
      knownNames.add(name2);
      visible.set(name2, definition);
    }
    if (this.modeFor(scope) !== "native") visible.set(RUN_CODE_NAME, this.requireCodeTransport());
    return {
      visible,
      knownNames,
      restrictableNames
    };
  }
  /**
  * Look up a tool as one scope sees it (scoped
  * shadows global; a restricted-away global reads as absent). Presenters pass
  * the calling agent so the rendered card matches the definition that
  * actually executed.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @returns the definition the scope resolves, or undefined when none is visible.
  */
  get(name2, scope) {
    return this.view(scope).visible.get(name2);
  }
  /**
  * Resolve the definition that MAY EXECUTE for a call, applying the mode
  * collapse at the operation boundary that owns it. The registry view
  * (`get`) is presentation-agnostic; here a MODEL-DIRECT call under `ptc`
  * may only name the reserved `run_code` transport, while a nested
  * sub-dispatch (a `parent` token set — the `run_code` SDK calling a tool
  * it bound) may call any visible tool. Denial surfaces as `UNKNOWN_TOOL`
  * through the executor, matching an absent definition.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @param nested - whether the call is a transport sub-dispatch, not a model-direct call.
  * @returns the definition that may run, or undefined when the call must be rejected.
  */
  resolveExecution(name2, scope, nested) {
    const tool = this.get(name2, scope);
    if (tool === void 0) return void 0;
    if (this.collapses(name2, scope, nested)) return void 0;
    return tool;
  }
  /**
  * Project visible definitions onto the allowlisted model-facing schema fields,
  * excluding execution and presentation callbacks.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @returns one deep-cloned schema per visible tool.
  */
  schemas(scope) {
    return [...this.view(scope).visible.values()].map((definition) => this.schemaOf(definition, true));
  }
  /** Project visible callable tools onto the generated PTC mode SDK contract. */
  sdkSchemas(scope) {
    return [...this.view(scope).visible.values()].filter((definition) => definition.name !== RUN_CODE_NAME).map((definition) => {
      const output = snapshotJsonValue(definition.output.schema);
      if (output === void 0) throw new Error(`tool "${definition.name}" output schema must be lossless JSON before SDK projection`);
      return {
        ...this.schemaOf(definition, true),
        output
      };
    });
  }
  /** Project one definition onto the model-facing schema fields. */
  schemaOf(definition, detachParameters) {
    const { name: name2, description, parameters } = definition;
    const detached = detachParameters ? snapshotJsonValue(parameters) : parameters;
    if (detached === void 0) throw new Error(`tool "${name2}" parameters must be lossless JSON before schema projection`);
    return {
      name: name2,
      description,
      parameters: detached
    };
  }
  /**
  * Classify a pending call through the caller's visible tool definition. Only
  * an exact `true` is parallel; unknown, hidden, undeclared, invalid, or
  * throwing classifiers are exclusive.
  * @param exec - call name, parsed arguments, and optional agent scope.
  * @returns the fail-closed scheduling mode.
  */
  executionMode(exec) {
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
    if (!tool?.isConcurrencySafe) return { kind: "exclusive" };
    try {
      return tool.isConcurrencySafe(exec.arguments) === true ? { kind: "parallel" } : { kind: "exclusive" };
    } catch {
      return { kind: "exclusive" };
    }
  }
  /**
  * Run the `tools/ptc-dispatch-log` waterfall over one settled sub-dispatch
  * and return the content the bridge should log on `tool/ptc-dispatch`.
  * Contained: when a listener throws, the method logs the original settled
  * content; that failure must not fail the dispatch or omit the settle event. Private:
  * the ONE consumer is the `run_code` bridge this registry constructs, which
  * receives it as a capability parameter (the `requireRuntime` idiom) — the
  * waterfall, not this invoker, is the public extension point.
  */
  async shapeDispatchLog(dispatch) {
    try {
      return await this.ctx.waterfall(scopeTarget(this, dispatch.agent), "tools/ptc-dispatch-log", dispatch, () => Promise.resolve(dispatch.content));
    } catch (error) {
      this.ctx.logger.warn(`tools: ptc-dispatch-log listener failed for ${dispatch.name}: ${errorMessage(error)}; logging the original settled content`);
      return dispatch.content;
    }
  }
  /**
  * Whether the `ptc` mode collapse denies a model-direct call: only the
  * reserved `run_code` transport may be named. Nested sub-dispatches (a
  * `parent` token set) bypass the collapse. One home for the
  * security-relevant predicate, shared by {@link resolveExecution} and
  * {@link createExecution} so the two can never drift apart.
  *
  * Resolved through {@link modeFor}, NOT `defaultMode`: an agent given `ptc`
  * by an agent preset under a native deployment is the composition
  * `dsh-agent-tool-presentation` exists for, and reading the deployment default would
  * leave exactly that agent uncollapsed — announcing one surface while
  * executing another, which is the bypass this collapse closes.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope whose effective presentation mode applies.
  * @param nested - whether the call is a transport sub-dispatch, not a model-direct call.
  */
  collapses(name2, scope, nested) {
    return !nested && this.modeFor(scope) === "ptc" && name2 !== "run_code";
  }
  /**
  * Execute through pre-policy, guards, around-dispatch, post-policy,
  * definition-owned content finalization, and final notification. Tool and
  * listener failures resolve as materialized error results; an invisible tool
  * reports `UNKNOWN_TOOL`. The returned outcome is the same lossless, frozen
  * snapshot final observers receive. Cancellation
  * arriving after entry and before final result materialization skips a
  * not-yet-started body with `ABORTED_BEFORE_DISPATCH` or replaces a
  * successful started outcome with `ABORTED`; already-started work is still
  * drained and may retain a tool-owned structured error.
  * @param exec - the typed same-process call input. The registry assigns its
  *   correlation token before policy begins.
  * @returns the materialized final result.
  */
  async execute(exec) {
    return this.prepareExecution(exec, (prepared) => this.completeScheduledExecution(prepared));
  }
  async completeScheduledExecution(prepared) {
    switch (prepared.kind) {
      case "dispatch": {
        const dispatched = await this.dispatchScheduledExecution(prepared.exec);
        return dispatched.kind === "post-result" ? await this.finalizeScheduledExecution(prepared.exec, dispatched.result) : this.finishScheduledExecution(prepared.exec, dispatched.result);
      }
      case "post-result":
        return await this.finalizeScheduledExecution(prepared.exec, prepared.result);
      case "final-result":
        return this.finishScheduledExecution(prepared.exec, prepared.result);
      /* v8 ignore next -- closed-union exhaustiveness guard */
      default:
        return assertNever(prepared, "scheduled tool preparation");
    }
  }
  createExecution(exec) {
    const deferredContexts = [];
    const token = createExecutionToken();
    const callId = exec.callId;
    const rootCallId = exec.rootCallId ?? callId;
    const name2 = exec.name;
    const agent = exec.agent;
    const parent = exec.parent;
    const signal = exec.signal;
    const visible = this.get(name2, agent);
    const collapsed = visible !== void 0 && this.collapses(name2, agent, parent !== void 0);
    const concludingExecutions = this.concludingExecutions;
    const base = {
      token,
      callId,
      rootCallId,
      name: name2,
      signal,
      ...agent !== void 0 ? { agent } : {},
      ...parent !== void 0 ? { parent } : {},
      deferContext(context) {
        deferredContexts.push(context);
      },
      concludeTurn() {
        concludingExecutions.add(this);
      }
    };
    const capturedFinalizer = visible?.finalizeContent?.bind(visible);
    const finalizerFor = () => collapsed && !signal.aborted ? void 0 : capturedFinalizer;
    try {
      const detached = snapshotJsonValue(exec.arguments);
      if (detached === void 0) throw new TypeError("tool execution arguments must be losslessly JSON-serializable");
      const execution = {
        ...base,
        arguments: deepFreeze(detached)
      };
      this.deferredContexts.set(execution, deferredContexts);
      this.contentFinalizers.set(execution, finalizerFor());
      this.cancellationStates.set(execution, {
        callerSignal: signal,
        bodyInvoked: false
      });
      if (collapsed) {
        if (signal.aborted) return {
          kind: "final-result",
          exec: execution,
          result: toolAbortedBeforeDispatchResult()
        };
        return {
          kind: "final-result",
          exec: execution,
          result: toolErrorResult(new ToolNotFoundError(name2, `only \`${RUN_CODE_NAME}\` is callable directly \u2014 call \`${name2}\` from inside a \`${RUN_CODE_NAME}\` program instead`))
        };
      }
      return {
        kind: "ready",
        exec: execution
      };
    } catch (error) {
      const execution = {
        ...base,
        arguments: void 0
      };
      this.contentFinalizers.set(execution, finalizerFor());
      return {
        kind: "final-result",
        exec: execution,
        result: toolErrorResult(error)
      };
    }
  }
  /**
  * Run the ordered pre-execute and monotonic guard stages for the scheduler.
  * @param input - the caller-supplied execution input.
  * @returns the prepared execution plus the next scheduler stage.
  * @internal
  */
  async prepareScheduledExecution(input) {
    return this.prepareExecution(input, (prepared) => prepared);
  }
  async prepareExecution(input, next) {
    const created = this.createExecution(input);
    if (created.kind !== "ready") return next(created);
    const exec = created.exec;
    if (this.callerCancelled(exec)) return next({
      kind: "final-result",
      exec,
      result: toolAbortedBeforeDispatchResult()
    });
    try {
      const carrier = scopeTarget(this, exec.agent);
      const gate = await this.ctx.waterfall(carrier, "tools/pre-execute", exec, () => Promise.resolve({ kind: "allow" }));
      const askResolution = gate.kind === "ask" ? await this.serviceAsk(exec, gate) : {
        decision: gate,
        approvalCancelled: false
      };
      const { decision } = askResolution;
      if (this.callerCancelled(exec) && askResolution.approvalCancelled) return await next({
        kind: "post-result",
        exec,
        result: toolAbortedBeforeDispatchResult()
      });
      const denialReason = decision.kind === "allow" ? this.guardReason(exec) : decision.reason;
      if (denialReason !== void 0) return await next({
        kind: "post-result",
        exec,
        result: this.materializeFinalResult({
          content: [{
            type: "text",
            text: `Error: ${denialReason}`
          }],
          isError: true,
          error: { message: denialReason }
        })
      });
      if (this.callerCancelled(exec)) return await next({
        kind: "post-result",
        exec,
        result: toolAbortedBeforeDispatchResult()
      });
      return await next({
        kind: "dispatch",
        exec
      });
    } catch (error) {
      return next({
        kind: "final-result",
        exec,
        result: toolErrorResult(error)
      });
    }
  }
  /** Whether the original caller signal is currently aborted. */
  callerCancelled(exec) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    return state.callerSignal.aborted;
  }
  /** Canonical cancellation outcome selected by whether the tool body started. */
  cancellationResult(exec, prior) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    return state.bodyInvoked ? toolAbortedResult(prior) : toolAbortedBeforeDispatchResult(prior);
  }
  /**
  * Dispatch the registered body with the original caller signal fused back
  * into any around-wrapper replacement. Cancellation never abandons the body:
  * a started promise reaches quiescence before its outcome becomes `ABORTED`.
  */
  async dispatchToolBody(exec) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    const wrapperSignal = exec.signal;
    const fused = fuseToolSignals(state.callerSignal, wrapperSignal);
    const signal = fused.signal;
    if (isAborted(signal)) {
      fused.dispose();
      return toolAbortedBeforeDispatchResult();
    }
    exec.signal = signal;
    try {
      const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
      if (!tool) throw new ToolNotFoundError(exec.name);
      state.bodyInvoked = true;
      const returned = await tool.execute(exec.arguments, exec);
      const result = this.createSuccessResult(exec, tool, returned);
      return isAborted(signal) ? toolAbortedResult(result) : result;
    } catch (error) {
      return toolErrorResult(error);
    } finally {
      fused.dispose();
      exec.signal = wrapperSignal;
    }
  }
  /**
  * Run around-dispatch and the tool body. Tool and unknown-tool failures still
  * receive post-execute; pipeline failures are already final.
  * @param exec - the prepared execution.
  * @returns whether the result still needs post-execute.
  * @internal
  */
  async dispatchScheduledExecution(exec) {
    try {
      const mutableExec = exec;
      const carrier = scopeTarget(this, exec.agent);
      const result = await this.ctx.waterfall(carrier, "tools/execute", mutableExec, () => this.dispatchToolBody(mutableExec));
      const normalized = this.normalizeDispatchResult(exec, result);
      const deferredContexts = this.deferredContexts.get(exec);
      if (deferredContexts === void 0) throw new Error("tool registry scheduler invariant violated: unprepared execution");
      const resultWithDeferredContexts = deferredContexts.length === 0 ? normalized : this.markCanonical(exec, {
        ...normalized,
        additionalContexts: [...deferredContexts, ...normalized.additionalContexts ?? []]
      });
      return {
        kind: "post-result",
        result: this.callerCancelled(exec) && !resultWithDeferredContexts.isError ? this.cancellationResult(exec, resultWithDeferredContexts) : resultWithDeferredContexts
      };
    } catch (error) {
      return {
        kind: "final-result",
        result: toolErrorResult(error)
      };
    }
  }
  /**
  * Run ordered post-execute, then apply definition-owned content finalization,
  * materialize, and notify the final outcome.
  * @param exec - the prepared execution.
  * @param result - dispatch/pre result that still needs post-execute.
  * @returns the materialized final result.
  * @internal
  */
  async finalizeScheduledExecution(exec, result) {
    try {
      const postResult = await this.postExecute(exec, result);
      return this.finishScheduledExecution(exec, this.callerCancelled(exec) && !postResult.isError ? this.cancellationResult(exec, postResult) : postResult);
    } catch (error) {
      return this.finishScheduledExecution(exec, toolErrorResult(error));
    }
  }
  /**
  * Materialize the candidate, apply definition-owned content finalization,
  * then materialize and notify the authoritative result.
  * @param exec - the prepared execution.
  * @param result - final result.
  * @returns the materialized final result.
  * @internal
  */
  finishScheduledExecution(exec, result) {
    let materializedResult;
    try {
      materializedResult = this.materializeFinalResult(result);
    } catch (error) {
      materializedResult = this.materializeFinalResult(toolErrorResult(error));
    }
    let finalResult;
    try {
      finalResult = this.materializeFinalResult(this.applyFinalContent(exec, materializedResult));
    } catch (error) {
      finalResult = this.materializeFinalResult(toolErrorResult(error));
    }
    this.notifyResult(exec, finalResult);
    return finalResult;
  }
  /** Apply the snapshotted tool-owned content transform without exposing other result fields. */
  applyFinalContent(exec, result) {
    const finalizeContent = this.contentFinalizers.get(exec);
    if (finalizeContent === void 0) return result;
    const content = finalizeContent(exec, result);
    return content === void 0 ? result : {
      ...result,
      content
    };
  }
  /** Notify observers without exposing a mutation or error channel into the outcome. */
  notifyResult(exec, result) {
    Object.freeze(exec);
    const { name: toolName, callId } = exec;
    const reportFailure = (error) => {
      this.ctx.logger.warn(`tool "${toolName}" (${callId}): tools/result observer failed: ${errorMessage(error)}`);
    };
    const callbacks = this.ctx.events.dispatch("emit", [
      scopeTarget(this, exec.agent),
      "tools/result",
      exec,
      result
    ]);
    for (const callback of callbacks) try {
      const returned = callback(exec, result);
      Promise.resolve(returned).catch(reportFailure);
    } catch (error) {
      reportFailure(error);
    }
  }
  /**
  * Resolve an `ask` decision to allow/deny through the approval seam. The
  * seam is consumed opportunistically with `ctx.get('approval')` — a
  * deployment that composes no ApprovalService keeps the historical degrade
  * to deny, and an unmount mid-session degrades the same way on the next ask.
  * An agent-less execution also degrades: without an agent there is no
  * session to audit to and no UI to route to. Otherwise the outcome maps
  * one-to-one — `allowed-once` proceeds; the three non-grants deny with
  * distinct reasons so the model can tell a human "no" from an absent
  * approval channel.
  */
  async serviceAsk(exec, ask) {
    const approval = this.ctx.get("approval");
    if (approval === void 0) return {
      decision: {
        kind: "deny",
        reason: ask.reason ?? `tool "${exec.name}" requires approval (not yet supported)`
      },
      approvalCancelled: false
    };
    if (exec.agent === void 0) return {
      decision: {
        kind: "deny",
        reason: `tool "${exec.name}" requires approval, but the call has no agent to route it through`
      },
      approvalCancelled: false
    };
    const outcome = await approval.request({
      agent: exec.agent,
      toolName: exec.name,
      callId: exec.callId,
      ...ask.reason !== void 0 ? { reason: ask.reason } : {},
      signal: exec.signal
    });
    switch (outcome) {
      case "allowed-once":
        return {
          decision: { kind: "allow" },
          approvalCancelled: false
        };
      case "rejected":
        return {
          decision: {
            kind: "deny",
            reason: `the user rejected tool "${exec.name}"`
          },
          approvalCancelled: false
        };
      case "cancelled":
        return {
          decision: {
            kind: "deny",
            reason: `approval for tool "${exec.name}" was cancelled`
          },
          approvalCancelled: true
        };
      case "unavailable":
        return {
          decision: {
            kind: "deny",
            reason: `tool "${exec.name}" requires approval, but no approval channel is available`
          },
          approvalCancelled: false
        };
      default:
        return assertNever(outcome, "ApprovalOutcome");
    }
  }
  /**
  * Run the `tools/post-execute` waterfall over a dispatched `result` and apply
  * its {@link PostToolDecision}: `accept` keeps the call successful (replacing
  * `content` when given), `block` turns it into an `isError` whose content is
  * the corrective `feedback`. Either decision may attach `additionalContexts`,
  * which are ferried on the returned result for the loop's active-batch FIFO.
  * Context deferred by the tool body survives an accepted result but is
  * discarded when the outer call is blocked; a block exposes only context the
  * blocking decision explicitly supplied.
  * Runs inside `execute`'s outer try/catch (a throwing listener → isError).
  */
  async postExecute(exec, result) {
    const decision = await this.ctx.waterfall(scopeTarget(this, exec.agent), "tools/post-execute", exec, result, () => Promise.resolve({ kind: "accept" }));
    const decisionContexts = decision.additionalContexts ?? [];
    if (decision.kind === "block") {
      const message = failureMessageFromContent(decision.feedback);
      return this.markCanonical(exec, {
        content: decision.feedback,
        isError: true,
        error: { message },
        ...decisionContexts.length > 0 ? { additionalContexts: decisionContexts } : {}
      });
    }
    if (Object.hasOwn(decision, "content") && Object.hasOwn(decision, "value")) throw new TypeError("tools/post-execute accept decision cannot replace both value and content");
    const additionalContexts = [...result.additionalContexts ?? [], ...decisionContexts];
    if (Object.hasOwn(decision, "value")) {
      if (result.isError) throw new TypeError("tools/post-execute cannot replace the value of a failed result");
      const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
      if (tool === void 0) throw new ToolNotFoundError(exec.name);
      const replaced = this.createSuccessResult(exec, tool, decision.value);
      return this.markCanonical(exec, {
        ...replaced,
        ...additionalContexts.length > 0 ? { additionalContexts } : {}
      });
    }
    return this.markCanonical(exec, {
      ...result,
      ...decision.content !== void 0 ? { content: decision.content } : {},
      ...additionalContexts.length > 0 ? { additionalContexts } : {}
    });
  }
  /** Registry-normalized results and the exact dispatch that validated each value. */
  canonicalResults = /* @__PURE__ */ new WeakMap();
  /** Mark one registry-normalized result as canonical only for its owning dispatch. */
  markCanonical(exec, result) {
    this.canonicalResults.set(result, exec.token);
    return result;
  }
  /** Snapshot, validate, render, and optionally project one successful body value. */
  createSuccessResult(exec, tool, candidate) {
    const detached = snapshotToolValue(tool.name, candidate);
    const violations = validateJsonSchemaValue(tool.output.schema, detached, "value");
    if (violations.length > 0) throw new ToolOutputError(tool.name, violations);
    const value = deepFreeze(detached);
    let rendered;
    try {
      rendered = tool.output.render(exec.arguments, value);
    } catch (error) {
      throw projectionError(tool.name, "render", error);
    }
    const content = snapshotProjection(tool.name, "render", rendered);
    let meta;
    if (exec.parent === void 0 && tool.output.presentationMeta !== void 0) {
      let projected;
      try {
        projected = tool.output.presentationMeta(exec.arguments, value);
      } catch (error) {
        throw projectionError(tool.name, "presentationMeta", error);
      }
      meta = snapshotProjection(tool.name, "presentationMeta", projected);
    }
    const concludesTurn = this.concludingExecutions.has(exec);
    return this.markCanonical(exec, this.materializeFinalResult({
      isError: false,
      value,
      content,
      ...meta !== void 0 ? { meta } : {},
      ...concludesTurn ? { concludesTurn: true } : {}
    }));
  }
  /** Normalize an around-dispatch wrapper's authored result through the owning output contract. */
  normalizeDispatchResult(exec, result) {
    if (this.canonicalResults.get(result) === exec.token) return result;
    if (result.isError) return this.markCanonical(exec, {
      isError: true,
      error: result.error,
      content: result.content,
      ...result.meta !== void 0 ? { meta: result.meta } : {},
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    });
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
    if (tool === void 0) throw new ToolNotFoundError(exec.name);
    const normalized = this.createSuccessResult(exec, tool, result.value);
    return this.markCanonical(exec, {
      ...normalized,
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    });
  }
  /** Materialize the authoritative commit outcome once, immediately before `tools/result`. */
  materializeFinalResult(result) {
    const presentation = {
      content: result.content,
      ...result.meta !== void 0 ? { meta: result.meta } : {},
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    };
    if (result.isError) return materializePresentation({
      isError: true,
      error: result.error,
      ...presentation
    });
    return deepFreeze({
      ...materializePresentation({
        isError: false,
        ...presentation,
        ...result.concludesTurn === true ? { concludesTurn: true } : {}
      }),
      value: result.value
    });
  }
};
function createExecutionToken() {
  return Symbol("dsh.tool.execution");
}
function toolErrorResult(error) {
  const info = errorInfo(error);
  const message = errorMessage(error);
  return {
    content: [{
      type: "text",
      text: `Error: ${message}`
    }],
    isError: true,
    error: {
      message,
      ...info ? { info } : {}
    }
  };
}
function isAborted(signal) {
  return signal.aborted;
}
function fuseToolSignals(caller, wrapper) {
  if (caller === wrapper) return {
    signal: caller,
    dispose() {
    }
  };
  const controller = new AbortController();
  let listening = false;
  const dispose = () => {
    if (!listening) return;
    listening = false;
    caller.removeEventListener("abort", abortFromCaller);
    wrapper.removeEventListener("abort", abortFromWrapper);
  };
  const abortFrom = (source) => {
    const reason = source.reason;
    controller.abort(reason);
    dispose();
  };
  const abortFromCaller = () => {
    abortFrom(caller);
  };
  const abortFromWrapper = () => {
    abortFrom(wrapper);
  };
  if (wrapper.aborted) abortFromWrapper();
  else if (caller.aborted) abortFromCaller();
  else {
    listening = true;
    caller.addEventListener("abort", abortFromCaller, { once: true });
    wrapper.addEventListener("abort", abortFromWrapper, { once: true });
  }
  return {
    signal: controller.signal,
    dispose
  };
}
function toolAbortedResult(prior) {
  const additionalContexts = prior?.additionalContexts ?? [];
  return {
    content: [{
      type: "text",
      text: "Error: tool call aborted"
    }],
    isError: true,
    error: {
      message: "tool call aborted",
      info: {
        name: "AbortError",
        code: TOOL_ABORTED
      }
    },
    ...additionalContexts.length > 0 ? { additionalContexts } : {}
  };
}
function toolAbortedBeforeDispatchResult(prior) {
  const additionalContexts = prior?.additionalContexts ?? [];
  return {
    content: [{
      type: "text",
      text: "Error: tool call aborted before dispatch"
    }],
    isError: true,
    error: {
      message: "tool call aborted before dispatch",
      info: {
        name: "AbortError",
        code: TOOL_ABORTED_BEFORE_DISPATCH
      }
    },
    ...additionalContexts.length > 0 ? { additionalContexts } : {}
  };
}

// src/host/tools.ts
var textOutput = {
  schema: { type: "string" },
  render: (_args, value) => [{ type: "text", text: value }]
};
function buildCompanyTools(service, agentId) {
  const actorOf = () => {
    const record = service.agent(agentId);
    return { type: "agent", id: agentId, name: record?.name ?? agentId };
  };
  const perform = async (run) => {
    if (!service.enabled) return "\u274C company_disabled\uFF1A\u516C\u53F8\u6A21\u5F0F\u5F53\u524D\u5DF2\u505C\u7528\uFF0C\u8BF7\u7B49\u8463\u4E8B\u4F1A\u542F\u7528\u540E\u518D\u64CD\u4F5C\u3002";
    try {
      const result = await run();
      return result.ok ? `\u2705 ${typeof result.data === "string" ? result.data : JSON.stringify(result.data)}` : `\u274C ${result.code ?? "error"}\uFF1A${result.message ?? "\u64CD\u4F5C\u88AB\u62D2\u7EDD"}`;
    } catch (error) {
      return `\u274C internal_error\uFF1A${error instanceof Error ? error.message : String(error)}`;
    }
  };
  return [
    defineTool({
      name: "company_org",
      description: "\u67E5\u770B\u516C\u53F8\u7EC4\u7EC7\u67B6\u6784\u4E0E\u901A\u8BAF\u5F55\uFF08\u59D3\u540D/\u804C\u4F4D/\u6C47\u62A5\u7EBF/\u5458\u5DE5 ID\uFF09\u3002\u8981\u627E\u4EBA\u534F\u4F5C\u3001\u786E\u8BA4\u6C47\u62A5\u5173\u7CFB\u6216\u67E5\u4E0A\u7EA7 ID \u65F6\u7528\u3002",
      parameters: {},
      output: textOutput,
      execute: () => perform(async () => {
        const lines = service.agents().filter((record) => record.status !== "terminated").map((record) => `- ${record.name}\uFF08${record.title}\uFF0Cid=${record.id}\uFF09\u6C47\u62A5\u7EBF\uFF1A${service.chainOf(record.id)}`);
        return { ok: true, data: lines.length === 0 ? "\uFF08\u516C\u53F8\u6682\u65E0\u5176\u4ED6\u5458\u5DE5\uFF09" : lines.join("\n") };
      })
    }),
    defineTool({
      name: "company_mail_send",
      description: "\u7ED9\u540C\u4E8B\u6216\u4E0A\u7EA7\u53D1\u516C\u53F8\u4FE1\u7BB1\u6D88\u606F\u3002\u95EE\u4FE1\u606F\u7528 question\uFF0C\u540C\u6B65\u4FE1\u606F\u7528 info\uFF0C\u8BF7\u4EBA\u534F\u4F5C/\u5BF9\u4E0B\u5C5E\u6D3E\u6D3B\u7528 request\u3002\u6279\u91CF\u6C9F\u901A\u8BF7\u4E00\u6B21\u8BF4\u6E05\u80CC\u666F\u3001\u8BC9\u6C42\u4E0E\u671F\u671B\u56DE\u5E94\u3002",
      parameters: {
        to: { type: "string", required: true, description: "\u6536\u4EF6\u4EBA\u5458\u5DE5 ID\uFF08company_org \u53EF\u67E5\uFF09\u6216 board \u8868\u793A\u8463\u4E8B\u4F1A" },
        kind: { type: "string", required: true, enum: ["info", "question", "request", "report"], description: "\u6D88\u606F\u7C7B\u578B" },
        body: { type: "string", required: true, description: "\u6D88\u606F\u6B63\u6587" },
        task_id: { type: "string", description: "\u53EF\u9009\uFF1A\u5173\u8054\u4EFB\u52A1 ID" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.sendMail(actorOf(), {
        toId: args.to,
        kind: args.kind,
        body: args.body,
        taskId: args.task_id ?? null
      }))
    }),
    defineTool({
      name: "company_mail_list",
      description: "\u67E5\u770B\u4F60\u81EA\u5DF1\u7684\u516C\u53F8\u4FE1\u7BB1\uFF08\u9ED8\u8BA4\u6700\u8FD1 20 \u6761\uFF09\u3002\u5F00\u5DE5\u524D\u626B\u4E00\u773C\u6709\u6CA1\u6709\u4E0A\u7EA7\u6307\u4EE4\u6216\u540C\u4E8B\u63D0\u95EE\u3002",
      parameters: {
        unread_only: { type: "boolean", description: "\u4EC5\u770B\u672A\u8BFB\uFF08status != read\uFF09" },
        limit: { type: "integer", description: "\u8FD4\u56DE\u6761\u6570\u4E0A\u9650\uFF0C\u9ED8\u8BA4 20" }
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const limit = args.limit ?? 20;
        const list = service.messages({ toId: agentId }).filter((record) => args.unread_only !== true || record.status !== "read").slice(0, limit).map((record) => `[${record.status}] ${record.id} \u2190 ${record.fromName}\uFF08${record.kind}\uFF09\uFF1A${record.body.slice(0, 160)}`);
        return {
          ok: true,
          data: list.length === 0 ? "\uFF08\u4FE1\u7BB1\u4E3A\u7A7A\uFF09" : `${list.join("\n")}

\u63D0\u793A\uFF1A\u6B63\u6587\u88AB\u6458\u8981\u622A\u65AD\u65F6\uFF0C\u7528 company_mail_read(mail_id) \u8BFB\u5168\u6587\uFF08\u4E0D\u8981\u53BB\u7FFB\u78C1\u76D8\uFF09\u3002`
        };
      })
    }),
    defineTool({
      name: "company_mail_read",
      description: "\u6309 mail_id \u8BFB\u4E00\u5C01\u4FE1\u7BB1\u6D88\u606F\u7684\u5B8C\u6574\u6B63\u6587\uFF08\u5217\u8868\u91CC\u7684\u6458\u8981\u662F\u622A\u65AD\u7684\uFF09\u3002",
      parameters: {
        mail_id: { type: "string", required: true, description: "company_mail_list \u7ED9\u51FA\u7684\u6D88\u606F ID" }
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const result = await service.readMail(args.mail_id);
        if (!result.ok || result.data === void 0) return result;
        const message = result.data;
        return {
          ok: true,
          data: [
            `\u6765\u81EA\uFF1A${message.fromName}\uFF08${message.fromType}\uFF09\xB7 \u7C7B\u578B\uFF1A${message.kind} \xB7 ${new Date(message.createdAt).toISOString()}`,
            ...message.taskId === null ? [] : [`\u5173\u8054\u4EFB\u52A1\uFF1A${message.taskId}`],
            "---",
            message.body
          ].join("\n")
        };
      })
    }),
    defineTool({
      name: "company_task_create",
      description: "\u5EFA\u4E00\u4E2A\u4EFB\u52A1\u3002\u53EF\u4EE5\u6307\u6D3E\u7ED9\u81EA\u5DF1\u3001\u4E0B\u5C5E\u6216\u540C\u4E8B\uFF1B\u4E5F\u53EF\u4EE5\u5EFA\u5B50\u4EFB\u52A1\u6302\u5728\u7236\u4EFB\u52A1\u4E0B\uFF08\u5B50\u4EFB\u52A1\u5168\u90E8\u5B8C\u6210\u65F6\u7236\u4EFB\u52A1\u81EA\u52A8\u5173\u95ED\uFF09\u3002",
      parameters: {
        title: { type: "string", required: true, description: "\u4EFB\u52A1\u6807\u9898" },
        desc: { type: "string", description: "\u4EFB\u52A1\u8BF4\u660E\u4E0E\u9A8C\u6536\u6807\u51C6" },
        assignee: { type: "string", description: "\u8D1F\u8D23\u4EBA\u5458\u5DE5 ID\uFF0C\u7F3A\u7701\u4E3A\u5F85\u8BA4\u9886" },
        project_id: { type: "string", description: "\u53EF\u9009\uFF1A\u5173\u8054\u9879\u76EE ID" },
        priority: { type: "integer", description: "\u4F18\u5148\u7EA7\uFF0C\u6570\u5B57\u8D8A\u5927\u8D8A\u7D27\u6025\uFF0C\u9ED8\u8BA4 0" },
        parent_task_id: { type: "string", description: "\u53EF\u9009\uFF1A\u7236\u4EFB\u52A1 ID" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.createTask(actorOf(), {
        title: args.title,
        desc: args.desc ?? "",
        assigneeId: args.assignee ?? null,
        projectId: args.project_id ?? null,
        priority: args.priority ?? 0,
        parentTaskId: args.parent_task_id ?? null
      }))
    }),
    defineTool({
      name: "company_task_list",
      description: "\u67E5\u770B\u4EFB\u52A1\u5217\u8868\uFF1A\u9ED8\u8BA4\u770B\u81EA\u5DF1\u7684\uFF0C\u4E5F\u53EF\u4EE5\u770B\u5168\u90E8\u6216\u6309\u72B6\u6001\u7B5B\u3002\u5F00\u5DE5\u5148\u770B\u8FD9\u91CC\u786E\u8BA4\u4F18\u5148\u7EA7\u3002",
      parameters: {
        scope: { type: "string", enum: ["mine", "all"], description: "mine=\u53EA\u770B\u81EA\u5DF1\u7684\uFF08\u9ED8\u8BA4\uFF09\uFF0Call=\u5168\u516C\u53F8" },
        status: { type: "string", enum: ["todo", "in_progress", "blocked", "review", "done", "cancelled"], description: "\u53EF\u9009\uFF1A\u6309\u72B6\u6001\u8FC7\u6EE4" }
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const list = service.tasks().filter((record) => args.scope === "all" ? true : record.assigneeId === agentId).filter((record) => args.status === void 0 || record.status === args.status).map((record) => `[${record.status}] ${record.id} ${record.title} @${service.agent(record.assigneeId ?? "")?.name ?? "\u5F85\u8BA4\u9886"}${record.result === null ? "" : ` \u2192 ${record.result.slice(0, 120)}`}`);
        return { ok: true, data: list.length === 0 ? "\uFF08\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1\uFF09" : list.join("\n") };
      })
    }),
    defineTool({
      name: "company_task_update",
      description: "\u66F4\u65B0\u4EFB\u52A1\uFF1Acheckout=true \u8868\u793A\u8BA4\u9886\u5E76\u5F00\u5DE5\uFF1Bstatus \u63A8\u8FDB\u5230 in_progress/blocked/review/done\uFF1Bresult \u5199\u7ED3\u8BBA\u3002\u88AB\u963B\u585E\u8981\u7F6E blocked \u5E76\u5199\u6E05\u539F\u56E0\u3002",
      parameters: {
        task_id: { type: "string", required: true, description: "\u4EFB\u52A1 ID" },
        status: { type: "string", enum: ["todo", "in_progress", "blocked", "review", "done", "cancelled"], description: "\u65B0\u72B6\u6001" },
        result: { type: "string", description: "\u7ED3\u8BBA/\u4EA7\u51FA/\u963B\u585E\u539F\u56E0" },
        checkout: { type: "boolean", description: "true = \u539F\u5B50\u8BA4\u9886\u8BE5\u4EFB\u52A1" },
        assignee: { type: "string", description: "\u6539\u6D3E\u7ED9\u67D0\u5458\u5DE5 ID" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.updateTask(actorOf(), args.task_id, {
        ...args.status !== void 0 ? { status: args.status } : {},
        ...args.result !== void 0 ? { result: args.result } : {},
        ...args.assignee !== void 0 ? { assigneeId: args.assignee } : {},
        ...args.checkout !== void 0 ? { checkout: args.checkout } : {}
      }))
    }),
    defineTool({
      name: "company_task_comment",
      description: "\u5728\u4EFB\u52A1\u4E0B\u5199\u4E00\u6761\u8BC4\u8BBA\uFF08\u534F\u4F5C\u8BA8\u8BBA/\u8FDB\u5EA6\u8BB0\u5F55\uFF09\u3002\u8BA8\u8BBA\u6C89\u6DC0\u5728\u4EFB\u52A1\u91CC\uFF0C\u65B9\u4FBF\u4ED6\u4EBA\u63A5\u624B\u3002",
      parameters: {
        task_id: { type: "string", required: true, description: "\u4EFB\u52A1 ID" },
        text: { type: "string", required: true, description: "\u8BC4\u8BBA\u5185\u5BB9" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.commentTask(actorOf(), args.task_id, args.text))
    }),
    defineTool({
      name: "company_report",
      description: "\u5411\u4E0A\u7EA7\u6C47\u62A5\uFF08\u53D1\u7ED9\u4F60\u7684\u76F4\u5C5E\u4E0A\u7EA7\uFF1B\u6CA1\u6709\u4E0A\u7EA7\u5219\u76F4\u8FBE\u8463\u4E8B\u4F1A\uFF09\u3002\u5B8C\u6210\u3001\u5361\u4F4F\u3001\u53D1\u73B0\u65B0\u95EE\u9898\u90FD\u7528\u5B83\uFF0C\u522B\u9ED8\u9ED8\u505A\u5B8C\u4E0D\u8BF4\u3002",
      parameters: {
        body: { type: "string", required: true, description: "\u6C47\u62A5\u6B63\u6587\uFF1A\u505A\u4E86\u4EC0\u4E48\u3001\u7ED3\u8BBA\u3001\u98CE\u9669\u3001\u9700\u8981\u7684\u652F\u6301" },
        task_id: { type: "string", description: "\u53EF\u9009\uFF1A\u5173\u8054\u4EFB\u52A1 ID" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.report(actorOf(), args.body, args.task_id ?? null))
    }),
    defineTool({
      name: "company_approval_request",
      description: "\u8BF7\u6C42\u5BA1\u6279\uFF1A\u82B1\u94B1\uFF08spend\uFF09\u3001\u4E0A\u7EBF/\u5BF9\u5916\u53D1\u5E03\uFF08strategy\uFF09\u3001\u5220\u9664\u6216\u9AD8\u5371\u64CD\u4F5C\uFF08danger\uFF09\u3001\u62DB\u8058\uFF08hire\uFF09\u7B49\u8D8A\u6743\u52A8\u4F5C\uFF0C\u5FC5\u987B\u5148\u5BA1\u6279\u518D\u52A8\u624B\u3002",
      parameters: {
        kind: { type: "string", required: true, enum: ["hire", "spend", "strategy", "danger", "other"], description: "\u5BA1\u6279\u7C7B\u522B" },
        title: { type: "string", required: true, description: "\u4E00\u53E5\u8BDD\u8BF4\u660E\u8981\u6279\u4EC0\u4E48" },
        detail: { type: "string", required: true, description: "\u7EC6\u8282\uFF1A\u5F71\u54CD\u8303\u56F4\u3001\u6210\u672C\u3001\u56DE\u6EDA\u65B9\u6848\u3001\u65F6\u95F4\u70B9" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.requestApproval(actorOf(), {
        kind: args.kind,
        title: args.title,
        detail: args.detail
      }))
    }),
    defineTool({
      name: "company_doc_list",
      description: "\u5217\u51FA\u8D44\u6599\u5E93\u6587\u6863\uFF08\u53EF\u6309\u9879\u76EE\u8FC7\u6EE4\uFF09\u4E0E\u4F60\u6709\u6743\u8BBF\u95EE\u7684\u9879\u76EE\u6E05\u5355\u3002",
      parameters: {
        project_id: { type: "string", description: "\u53EF\u9009\uFF1A\u53EA\u770B\u67D0\u4E2A\u9879\u76EE" }
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const projects = service.projects().map((project) => `- [\u9879\u76EE] ${project.name}\uFF08${project.id}\uFF0C\u6211\u7684\u6743\u9650\uFF1A${service.accessOf(agentId, project.id)}\uFF09`);
        const docs = service.docs(args.project_id).filter((doc) => service.accessOf(agentId, doc.projectId) !== "none").map((doc) => `- [\u8D44\u6599] ${doc.title}\uFF08${doc.id}\uFF0C\u8DEF\u5F84 ${doc.path}\uFF09`);
        const all = [...projects, ...docs];
        return { ok: true, data: all.length === 0 ? "\uFF08\u8D44\u6599\u5E93\u4E3A\u7A7A\uFF09" : all.join("\n") };
      })
    }),
    defineTool({
      name: "company_doc_read",
      description: "\u8BFB\u53D6\u4E00\u7BC7\u8D44\u6599\u7684\u5185\u5BB9\uFF08\u9700\u8981\u8BFB\u6743\u9650\uFF09\u3002\u63A5\u624B\u4EFB\u52A1\u524D\u5148\u8BFB\u76F8\u5173\u6587\u6863\u3002",
      parameters: {
        doc_id: { type: "string", required: true, description: "\u8D44\u6599 ID" }
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const result = await service.readDoc(actorOf(), args.doc_id);
        if (!result.ok || result.data === void 0) return result;
        return { ok: true, data: `# ${result.data.doc.title}

${result.data.content}` };
      })
    }),
    defineTool({
      name: "company_doc_write",
      description: "\u65B0\u5EFA\u6216\u8986\u76D6\u4E00\u7BC7\u8D44\u6599\uFF08\u9700\u8981\u5199\u6743\u9650\uFF1B\u65E0\u6743\u9650\u65F6\u5148 company_approval_request\uFF09\u3002\u8DEF\u5F84\u76F8\u5BF9\u9879\u76EE/\u8D44\u6599\u5E93\u6839\u76EE\u5F55\u3002",
      parameters: {
        path: { type: "string", required: true, description: "\u76F8\u5BF9\u8DEF\u5F84\uFF0C\u5982 reports/2026-09-19-daily.md" },
        content: { type: "string", required: true, description: "Markdown \u6B63\u6587" },
        title: { type: "string", description: "\u53EF\u9009\u6807\u9898\uFF0C\u9ED8\u8BA4\u7528\u8DEF\u5F84" },
        project_id: { type: "string", description: "\u53EF\u9009\uFF1A\u5199\u8FDB\u67D0\u4E2A\u9879\u76EE\uFF0C\u7F3A\u7701\u5199\u8FDB\u516C\u53F8\u8D44\u6599\u5E93" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.writeDoc(actorOf(), {
        projectId: args.project_id ?? null,
        path: args.path,
        content: args.content,
        ...args.title !== void 0 ? { title: args.title } : {}
      }))
    }),
    defineTool({
      name: "company_schedule_create",
      description: '\u7ED9\u81EA\u5DF1\u914D\u4E00\u4E2A\u5B9A\u65F6\u4EFB\u52A1\u3002kind=cron \u7528\u4E94\u6BB5 cron\uFF08\u5982 "0 9 * * *"\uFF09\uFF0Ckind=every \u7ED9\u79D2\u6570\uFF08\u226560\uFF09\uFF0Ckind=at \u7ED9 ISO \u65F6\u95F4\u6233\u3002\u5230\u70B9\u4F1A\u628A prompt \u6295\u7ED9\u4F60\u81EA\u5DF1\u3002',
      parameters: {
        kind: { type: "string", required: true, enum: ["cron", "every", "at"], description: "\u6392\u7A0B\u7C7B\u578B" },
        spec: { type: "string", required: true, description: "cron \u8868\u8FBE\u5F0F / \u79D2\u6570 / ISO \u65F6\u95F4\u6233" },
        prompt: { type: "string", required: true, description: "\u5230\u70B9\u8981\u505A\u7684\u4E8B\uFF0C\u5199\u6E05\u695A\u6B65\u9AA4\u4E0E\u4EA7\u51FA\u8981\u6C42" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.createSchedule(actorOf(), {
        agentId,
        kind: args.kind,
        spec: args.spec,
        prompt: args.prompt
      }))
    }),
    defineTool({
      name: "company_schedule_list",
      description: "\u67E5\u770B\u4F60\u81EA\u5DF1\u7684\u5B9A\u65F6\u4EFB\u52A1\u4E0E\u4E0B\u6B21\u89E6\u53D1\u65F6\u95F4\u3002",
      parameters: {},
      output: textOutput,
      execute: () => perform(async () => {
        const list = service.schedules(agentId).map((record) => {
          const spec = record.kind === "cron" ? `cron ${record.cron}` : record.kind === "every" ? `\u6BCF ${record.everySec}s` : `at ${record.at === null ? "" : new Date(record.at).toISOString()}`;
          return `- ${record.id} [${record.enabled ? "\u542F\u7528" : "\u505C\u7528"}] ${spec} \u4E0B\u6B21 ${new Date(record.nextRunAt).toISOString()}\uFF1A${record.prompt.slice(0, 80)}`;
        });
        return { ok: true, data: list.length === 0 ? "\uFF08\u6CA1\u6709\u5B9A\u65F6\u4EFB\u52A1\uFF09" : list.join("\n") };
      })
    }),
    defineTool({
      name: "company_schedule_delete",
      description: "\u5220\u9664\u4E00\u4E2A\u5B9A\u65F6\u4EFB\u52A1\u3002",
      parameters: {
        schedule_id: { type: "string", required: true, description: "\u6392\u7A0B ID" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.deleteSchedule(args.schedule_id))
    }),
    defineTool({
      name: "company_help",
      description: "\u516C\u53F8\u534F\u4F5C\u534F\u8BAE\u901F\u67E5\uFF1A\u4EC0\u4E48\u65F6\u5019\u7528\u54EA\u4E2A\u5DE5\u5177\u3001\u6C47\u62A5\u4E0E\u5BA1\u6279\u89C4\u5219\u3002\u4E0D\u786E\u5B9A\u6D41\u7A0B\u65F6\u8C03\u7528\u3002",
      parameters: {},
      output: textOutput,
      execute: () => perform(async () => ({ ok: true, data: HELP_TEXT }))
    })
  ];
}
var HELP_TEXT = [
  "\u516C\u53F8\u534F\u4F5C\u534F\u8BAE\uFF1A",
  "1. \u9886\u4EFB\u52A1\uFF1Acompany_task_list \u2192 company_task_update(checkout=true) \u2192 \u5E72\u6D3B\u3002",
  "2. \u8981\u4FE1\u606F\uFF1Acompany_org \u67E5\u4EBA \u2192 company_mail_send(kind=question)\u3002",
  "3. \u8981\u534F\u4F5C\uFF1A\u7ED9\u4E0B\u5C5E/\u540C\u4E8B company_task_create \u6D3E\u4EFB\u52A1\u6216 kind=request \u8BF7\u4EBA\u5E2E\u5FD9\u3002",
  "4. \u5361\u4F4F\u4E86\uFF1A\u4EFB\u52A1\u7F6E blocked\uFF08result \u5199\u539F\u56E0\uFF09\uFF0Ccompany_report \u4E0A\u62A5\u3002",
  "5. \u8D8A\u6743\u52A8\u4F5C\uFF08\u82B1\u94B1/\u4E0A\u7EBF/\u5220\u6570\u636E/\u62DB\u4EBA\uFF09\uFF1A\u5148 company_approval_request\uFF0C\u7B49 approval_result\u3002",
  "6. \u505A\u5B8C\uFF1A\u4EFB\u52A1\u7F6E review\uFF0Ccompany_doc_write \u843D\u4EA7\u51FA\uFF0Ccompany_report \u6C47\u62A5\u7ED3\u8BBA\u3002",
  "7. \u4F8B\u884C\u5DE5\u4F5C\uFF1Acompany_schedule_create \u5B9A\u65F6\u63D0\u9192\u81EA\u5DF1\u3002"
].join("\n");
var DISPATCH_DESC = "\u5EFA\u4EFB\u52A1\u5E76\u4E00\u6B65\u6295\u9012\u7ED9\u6307\u5B9A\u5458\u5DE5\uFF08\u4F18\u5148\u7528\u5B83\uFF0C\u800C\u4E0D\u662F\u5148 task_create \u518D mail\uFF09\u3002\u5FC5\u987B\u5199\u6E05\u9A8C\u6536\u6807\u51C6\u3002";
var ANNOUNCE_DESC = "\u5411\u67D0\u9879\u76EE\u7FA4\uFF08\u6216\u5927\u5385\uFF09\u53D1\u4E00\u6761\u9762\u5411\u8463\u4E8B\u4F1A\u7684\u7B80\u62A5\u3002\u5458\u5DE5\u6C47\u62A5\u7531\u516C\u53F8\u81EA\u52A8\u8F6C\u6210\u7B80\u62A5\uFF0C\u4E0D\u8981\u91CD\u590D\u64AD\u62A5\u540C\u4E00\u5185\u5BB9\u3002";
var APPROVAL_DECIDE_DESC = "\u88C1\u51B3\u9001\u5230\u4F60\u8FD9\u91CC\u7684\u5BA1\u6279\uFF08\u4F60\u662F\u4E00\u5BA1\uFF09\u3002\u6279\u51C6/\u9A73\u56DE\u4F1A\u81EA\u52A8\u628A\u7ED3\u679C\u56DE\u6295\u7ED9\u53D1\u8D77\u4EBA\u3002";
function buildCeoExtras(service, agentId) {
  const actorOf = () => {
    const record = service.agent(agentId);
    return { type: "agent", id: agentId, name: record?.name ?? agentId };
  };
  const perform = async (run) => {
    if (!service.enabled) return "\u274C company_disabled\uFF1A\u516C\u53F8\u6A21\u5F0F\u5F53\u524D\u5DF2\u505C\u7528\u3002";
    try {
      const result = await run();
      return result.ok ? `\u2705 ${typeof result.data === "string" ? result.data : JSON.stringify(result.data)}` : `\u274C ${result.code ?? "error"}\uFF1A${result.message ?? "\u64CD\u4F5C\u88AB\u62D2\u7EDD"}`;
    } catch (error) {
      return `\u274C internal_error\uFF1A${error instanceof Error ? error.message : String(error)}`;
    }
  };
  return [
    defineTool({
      name: "company_dispatch",
      description: DISPATCH_DESC,
      parameters: {
        employee: { type: "string", required: true, description: "\u8D1F\u8D23\u4EBA\u5458\u5DE5 ID \u6216\u540D\u5B57" },
        title: { type: "string", required: true, description: "\u4EFB\u52A1\u6807\u9898" },
        desc: { type: "string", required: true, description: "\u4EFB\u52A1\u8BF4\u660E + \u9A8C\u6536\u6807\u51C6" },
        project_id: { type: "string", description: "\u53EF\u9009\uFF1A\u5173\u8054\u9879\u76EE ID" },
        priority: { type: "integer", description: "\u4F18\u5148\u7EA7\uFF0C\u9ED8\u8BA4 0" }
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const target = service.agents().find((record) => record.id === args.employee || record.name === args.employee);
        if (target === void 0) return { ok: false, code: "unknown_employee", message: `\u627E\u4E0D\u5230\u5458\u5DE5\u300C${args.employee}\u300D\uFF0C\u7528 company_org \u67E5\u540D\u518C` };
        return service.dispatch(actorOf(), {
          employeeId: target.id,
          title: args.title,
          desc: args.desc,
          projectId: args.project_id ?? null,
          priority: args.priority ?? 0
        });
      })
    }),
    defineTool({
      name: "company_announce",
      description: ANNOUNCE_DESC,
      parameters: {
        text: { type: "string", required: true, description: "\u7B80\u62A5\u6B63\u6587\uFF08markdown\uFF09" },
        project_id: { type: "string", description: "\u76EE\u6807\u9879\u76EE ID\uFF1B\u7F3A\u7701\u53D1\u5230\u5927\u5385" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.announce(actorOf(), args.project_id ?? null, args.text))
    }),
    defineTool({
      name: "company_hire_request",
      description: "\u63D0\u4EA4\u62DB\u8058\u7533\u8BF7\uFF08\u4F60\u6CA1\u6709\u4EBA\u4E8B\u6743\uFF0C\u62DB\u4EBA\u8981\u8463\u4E8B\u4F1A\u6279\u51C6\uFF1B\u6279\u51C6\u540E\u7CFB\u7EDF\u81EA\u52A8\u521B\u5EFA\u5458\u5DE5\u5E76\u5165\u804C\uFF09\u3002\u5199\u6E05\u5C97\u4F4D\u3001\u804C\u8D23\u4E0E\u8D1F\u8D23\u9879\u76EE\u3002",
      parameters: {
        name: { type: "string", required: true, description: "\u65B0\u5458\u5DE5\u59D3\u540D" },
        title: { type: "string", required: true, description: "\u804C\u4F4D\uFF08\u5982 \u8FD0\u7EF4\u5DE5\u7A0B\u5E08\uFF09" },
        persona: { type: "string", required: true, description: "\u5C97\u4F4D\u8BF4\u660E\u4E66\uFF1A\u804C\u8D23\u3001\u8FB9\u754C\u3001\u9A8C\u6536\u6807\u51C6\u3001\u6C47\u62A5\u65B9\u5F0F" },
        project_ids: { type: "array", items: { type: "string" }, description: "\u8D1F\u8D23\u7684\u9879\u76EE ID \u5217\u8868\uFF08\u53EF\u591A\u9009\uFF09" },
        role: { type: "string", description: "\u89D2\u8272 key\uFF0C\u7F3A\u7701 engineer" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.requestApproval(actorOf(), {
        kind: "hire",
        title: `\u62DB\u8058 ${args.name}\uFF08${args.title}\uFF09`,
        detail: [
          `\u59D3\u540D\uFF1A${args.name}`,
          `\u804C\u4F4D\uFF1A${args.title}`,
          args.project_ids === void 0 ? "\u8D1F\u8D23\u9879\u76EE\uFF1A\uFF08\u672A\u6307\u5B9A\uFF09" : `\u8D1F\u8D23\u9879\u76EE\uFF1A${args.project_ids.join("\u3001")}`,
          "\u5C97\u4F4D\u8BF4\u660E\u4E66\uFF1A",
          args.persona,
          "",
          "\u8463\u4E8B\u4F1A\u6279\u51C6\u540E\u7CFB\u7EDF\u5C06\u81EA\u52A8\u521B\u5EFA\u8BE5\u5458\u5DE5\u5E76\u5165\u804C\u3002"
        ].join("\n"),
        action: {
          kind: "hire",
          payload: {
            name: args.name,
            title: args.title,
            role: args.role ?? "engineer",
            managerId: null,
            projectIds: args.project_ids ?? [],
            persona: args.persona,
            provider: null,
            model: null,
            effort: null,
            presetId: null,
            dailyTokenCap: null
          }
        }
      }))
    }),
    defineTool({
      name: "company_approval_decide",
      description: APPROVAL_DECIDE_DESC,
      parameters: {
        approval_id: { type: "string", required: true, description: "\u5BA1\u6279 ID" },
        approve: { type: "boolean", required: true, description: "true=\u6279\u51C6\uFF0Cfalse=\u9A73\u56DE" },
        note: { type: "string", description: "\u51B3\u7B56\u8BF4\u660E\uFF08\u4F1A\u56DE\u4F20\u7ED9\u53D1\u8D77\u4EBA\uFF09" }
      },
      output: textOutput,
      execute: (args) => perform(async () => service.decideApproval(args.approval_id, args.approve, args.note ?? "", actorOf()))
    })
  ];
}
function buildChannelTools(service) {
  const ceo = service.ceo();
  const actorId = ceo?.id ?? "agt_ceo";
  return [...buildCompanyTools(service, actorId), ...buildCeoExtras(service, actorId)];
}
function buildCallTool(service) {
  return defineTool({
    name: "company_call",
    description: "\u628A\u4E00\u9879\u5DE5\u4F5C\u6D3E\u7ED9\u516C\u53F8\u91CC\u7684\u5458\u5DE5\u6216 CEO\u3002\u5F53\u7528\u6237\u8BF4\u300C@\u67D0\u4EBA\u505A\u67D0\u4E8B\u300D\u300C\u8BA9\u67D0\u4EBA\u505A\u67D0\u4E8B\u300D\u65F6\u4F7F\u7528\u3002\u5B8C\u6210\u540E\u7ED3\u679C\u4F1A\u4EE5\u7B80\u62A5\u5F62\u5F0F\u51FA\u73B0\u5728\u5BF9\u5E94\u7684\u9879\u76EE\u7FA4\u4F1A\u8BDD\u91CC\u3002",
    parameters: {
      employee: { type: "string", required: true, description: "\u5458\u5DE5\u540D\u5B57\u6216 ID\uFF08\u5982 \u9646\u9065\u3001\u987E\u781A\u3001\u53F8\u5357\uFF09" },
      task: { type: "string", required: true, description: "\u8981\u505A\u7684\u4E8B\uFF1A\u80CC\u666F\u3001\u671F\u671B\u4EA7\u51FA\u3001\u622A\u6B62\u65F6\u95F4" },
      project: { type: "string", description: "\u53EF\u9009\uFF1A\u9879\u76EE\u540D\u6216 ID\uFF08\u7528\u4E8E\u5F52\u53E3\u6C47\u62A5\uFF09" }
    },
    output: textOutput,
    execute: async (args) => {
      if (!service.enabled) return "\u274C \u516C\u53F8\u6A21\u5F0F\u5F53\u524D\u5DF2\u505C\u7528\uFF08\u9762\u677F\u6216 /company on \u53EF\u542F\u7528\uFF09\u3002";
      try {
        const target = service.agents().find(
          (record) => record.status !== "terminated" && (record.id === args.employee || record.name === args.employee)
        );
        if (target === void 0) {
          const roster = service.agents().filter((record) => record.status !== "terminated").map((record) => `${record.name}\uFF08${record.title}\uFF09`).join("\u3001");
          return `\u274C \u627E\u4E0D\u5230\u5458\u5DE5\u300C${args.employee}\u300D\u3002\u5F53\u524D\u540D\u518C\uFF1A${roster === "" ? "\uFF08\u7A7A\uFF09" : roster}`;
        }
        const projectId = args.project === void 0 ? target.projectIds[0] ?? null : service.projects().find((project2) => project2.id === args.project || project2.name === args.project)?.id ?? null;
        const result = await service.dispatch(BOARD, {
          employeeId: target.id,
          title: args.task.length > 60 ? `${args.task.slice(0, 60)}\u2026` : args.task,
          desc: args.task,
          projectId,
          priority: 1
        });
        if (!result.ok || result.data === void 0) return `\u274C ${result.message ?? "\u6D3E\u6D3B\u5931\u8D25"}`;
        const project = result.data.projectId === null ? void 0 : service.projects().find((entry) => entry.id === result.data.projectId);
        const where = project === void 0 ? "\u300C\u4E00\u4EBA\u516C\u53F8 \xB7 \u5927\u5385\u300D" : `\u300C${project.name} \xB7 \u9879\u76EE\u7FA4\u300D`;
        return `\u2705 \u5DF2\u6D3E\u7ED9 ${target.name}\uFF08\u4EFB\u52A1 ${result.data.id}\uFF09\u3002\u5B8C\u6210\u540E\u7B80\u62A5\u4F1A\u53D1\u5230 ${where}\u3002`;
      } catch (error) {
        return `\u274C internal_error\uFF1A${error instanceof Error ? error.message : String(error)}`;
      }
    }
  });
}
function callPromptSection(service) {
  return () => {
    if (!service.enabled) return "";
    const roster = service.agents().filter((record) => record.status !== "terminated").map((record) => `${record.name}\uFF08${record.title}\uFF09`).join("\u3001");
    if (roster === "") return "";
    return [
      "## \u4E00\u4EBA\u516C\u53F8",
      "\u672C\u673A\u8FD0\u884C\u7740\u300C\u4E00\u4EBA\u516C\u53F8\u300D\uFF1A\u7528\u6237\u53EF\u4EE5 @\u5458\u5DE5\u540D \u6216\u8BF4\u300C\u8BA9\u67D0\u4EBA\u505A\u67D0\u4E8B\u300D\u6765\u6D3E\u6D3B\uFF0C\u6B64\u65F6\u4F60\u5FC5\u987B\u8C03\u7528 `company_call` \u5DE5\u5177\u5B8C\u6210\u8F6C\u4EA4\uFF08\u4E0D\u8981\u81EA\u5DF1\u4EE3\u505A\u516C\u53F8\u5458\u5DE5\u7684\u6D3B\uFF09\u3002",
      `\u5F53\u524D\u540D\u518C\uFF1A${roster}\u3002`,
      "\u6D3E\u6D3B\u540E\u544A\u8BC9\u7528\u6237\uFF1A\u7ED3\u679C\u4F1A\u4EE5\u7B80\u62A5\u5F62\u5F0F\u51FA\u73B0\u5728\u5BF9\u5E94\u9879\u76EE\u7FA4\u4F1A\u8BDD\uFF08\u6216\u300C\u4E00\u4EBA\u516C\u53F8 \xB7 \u5927\u5385\u300D\uFF09\u3002"
    ].join("\n");
  };
}

// src/host/commands.ts
var USAGE = [
  "/company status \u2014 \u516C\u53F8\u6982\u51B5",
  "/company org \u2014 \u7EC4\u7EC7\u67B6\u6784",
  "/company tasks [done|todo|all] \u2014 \u4EFB\u52A1\u6E05\u5355",
  "/company assign <\u5458\u5DE5> <\u4EFB\u52A1\u6807\u9898> \u2014 \u6D3E\u6D3B",
  "/company inbox \u2014 \u8463\u4E8B\u4F1A\u4FE1\u7BB1",
  "/company approve <\u5BA1\u6279ID> [\u8BF4\u660E] \u2014 \u6279\u51C6",
  "/company reject <\u5BA1\u6279ID> [\u8BF4\u660E] \u2014 \u9A73\u56DE",
  "/company on | off \u2014 \u542F\u7528/\u505C\u7528\u516C\u53F8\u6A21\u5F0F",
  "/call <\u5458\u5DE5\u540D\u6216ID> <\u4EFB\u52A1\u63CF\u8FF0> \u2014 \u76F4\u63A5\u6D3E\u6D3B\uFF08\u7B49\u4EF7\u4E8E @\u5458\u5DE5\u540D\uFF09"
].join("\n");
function registerCompanyCommand(ctx, service, log) {
  ctx.commands.register({
    name: "company",
    description: "\u4E00\u4EBA\u516C\u53F8\uFF1A\u67E5\u770B/\u6D3E\u5DE5/\u5BA1\u6279/\u542F\u505C",
    input: { hint: "status | org | tasks | assign <\u5458\u5DE5> <\u4EFB\u52A1> | inbox | approve <id> | reject <id> | on | off" },
    handler: async ({ rawInput }) => {
      const [sub = "status", ...rest] = rawInput.trim().split(/\s+/);
      try {
        switch (sub) {
          case "":
          case "status": {
            const state = service.snapshot();
            return success([
              `\u{1F3E2} ${state.companyName}\uFF08${state.enabled ? "\u8FD0\u884C\u4E2D" : "\u5DF2\u505C\u7528"}\uFF09 \xB7 \u6839\u76EE\u5F55 ${state.root}`,
              `\u5458\u5DE5 ${state.stats.agents} \u4EBA \xB7 \u8FDB\u884C\u4E2D\u4EFB\u52A1 ${state.stats.activeTasks} \xB7 \u5F85\u5BA1\u6279 ${state.stats.pendingApprovals} \xB7 \u4ECA\u65E5 token ${state.stats.tokensToday}`,
              `\u4ECA\u65E5\u5B8C\u6210 ${state.stats.doneToday} \u9879 \xB7 \u672A\u8BFB\u6765\u4FE1 ${state.stats.unreadMail} \u5C01`
            ].join("\n"));
          }
          case "org": {
            const lines = service.agents().map((record) => `- ${record.name}\uFF08${record.title}\uFF0C${record.status}\uFF0C\u6A21\u578B ${record.model ?? "\u9ED8\u8BA4"}\uFF09id=${record.id} \xB7 ${service.chainOf(record.id)}`);
            return success(lines.length === 0 ? "\u516C\u53F8\u8FD8\u6CA1\u6709\u5458\u5DE5\uFF0C\u7528 /company assign \u524D\u5148\u5728\u9762\u677F\u62DB\u8058\u3002" : lines.join("\n"));
          }
          case "tasks": {
            const filter = rest[0];
            const tasks = service.tasks().filter((task) => filter === void 0 || filter === "all" || task.status === filter).slice(0, 30);
            return success(tasks.length === 0 ? "\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1\u3002" : tasks.map((task) => `[${task.status}] ${task.id} ${task.title} @${service.agent(task.assigneeId ?? "")?.name ?? "\u5F85\u8BA4\u9886"}`).join("\n"));
          }
          case "assign": {
            const [name2, ...titleParts] = rest;
            const title = titleParts.join(" ");
            if (name2 === void 0 || title === "") return failure("\u7528\u6CD5\uFF1A/company assign <\u5458\u5DE5\u540D\u6216id> <\u4EFB\u52A1\u6807\u9898>");
            const target = service.agents().find((record) => record.name === name2 || record.id === name2);
            if (target === void 0) return failure(`\u627E\u4E0D\u5230\u5458\u5DE5\u300C${name2}\u300D\uFF0C\u7528 /company org \u770B\u770B\u3002`);
            const result = await service.createTask(BOARD, { title, assigneeId: target.id, desc: "\u7531\u8463\u4E8B\u4F1A\u901A\u8FC7 /company assign \u6307\u6D3E\u3002" });
            if (!result.ok || result.data === void 0) return failure(result.message ?? "\u6D3E\u5DE5\u5931\u8D25");
            return success(`\u5DF2\u628A\u300C${title}\u300D\u6D3E\u7ED9 ${target.name}\uFF08\u4EFB\u52A1 ${result.data.id}\uFF09\uFF0C\u4FE1\u7BB1\u6295\u9012\u5C06\u5728\u4E0B\u4E2A\u8C03\u5EA6\u5468\u671F\u9001\u8FBE\u3002`);
          }
          case "inbox": {
            const inbox = service.messages({ toId: "board" }).slice(0, 20);
            return success(inbox.length === 0 ? "\u8463\u4E8B\u4F1A\u4FE1\u7BB1\u4E3A\u7A7A\u3002" : inbox.map((message) => `[${message.status}] ${message.id} \u2190 ${message.fromName}\uFF08${message.kind}\uFF09\uFF1A${message.body.slice(0, 120)}`).join("\n"));
          }
          case "approve":
          case "reject": {
            const [id, ...noteParts] = rest;
            if (id === void 0) return failure(`\u7528\u6CD5\uFF1A/company ${sub} <\u5BA1\u6279ID> [\u8BF4\u660E]`);
            const result = await service.decideApproval(id, sub === "approve", noteParts.join(" "));
            return result.ok ? success(`\u5BA1\u6279 ${id} \u5DF2${sub === "approve" ? "\u6279\u51C6" : "\u9A73\u56DE"}\uFF0C\u7ED3\u679C\u4F1A\u6295\u9012\u7ED9\u53D1\u8D77\u4EBA\u3002`) : failure(result.message ?? "\u88C1\u51B3\u5931\u8D25");
          }
          case "on":
          case "off": {
            const result = await service.setEnabled(sub === "on");
            return result.ok ? success(sub === "on" ? "\u516C\u53F8\u6A21\u5F0F\u5DF2\u542F\u7528\u3002" : "\u516C\u53F8\u6A21\u5F0F\u5DF2\u505C\u7528\uFF1A\u8C03\u5EA6\u4E0E\u6295\u9012\u5DF2\u505C\u3001\u5E38\u9A7B\u5458\u5DE5\u5DF2\u5378\u8F7D\uFF0C\u6570\u636E\u4E0E\u4F1A\u8BDD\u539F\u6837\u4FDD\u7559\u3002") : failure(result.message ?? "\u5207\u6362\u5931\u8D25");
          }
          default:
            return failure(`\u672A\u77E5\u5B50\u547D\u4EE4\u300C${sub}\u300D\u3002
${USAGE}`);
        }
      } catch (error) {
        log(`/company ${sub} \u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
        return failure(error instanceof Error ? error.message : String(error));
      }
    }
  });
}
function registerCallCommand(ctx, service, log) {
  ctx.commands.register({
    name: "call",
    description: "\u628A\u4E00\u9879\u5DE5\u4F5C\u6D3E\u7ED9\u67D0\u4F4D\u5458\u5DE5\uFF08\u6216 CEO\uFF09",
    input: { hint: "<\u5458\u5DE5\u540D\u6216ID> <\u4EFB\u52A1\u63CF\u8FF0>" },
    handler: async ({ rawInput }) => {
      const trimmed = rawInput.trim();
      if (trimmed === "") return { kind: "error", text: "\u7528\u6CD5\uFF1A/call <\u5458\u5DE5\u540D\u6216ID> <\u4EFB\u52A1\u63CF\u8FF0>\uFF08\u7528 /company org \u770B\u540D\u518C\uFF09" };
      const [who, ...rest] = trimmed.split(/\s+/);
      const task = rest.join(" ").trim();
      if (task === "") return { kind: "error", text: `\u8BF7\u8865\u4E0A\u4EFB\u52A1\u63CF\u8FF0\uFF1A/call ${who} <\u4EFB\u52A1\u63CF\u8FF0>` };
      try {
        const target = service.agents().find(
          (record) => record.status !== "terminated" && (record.id === who || record.name === who)
        );
        if (target === void 0) {
          const roster = service.agents().filter((record) => record.status !== "terminated").map((record) => `${record.name}(${record.id})`).join("\u3001");
          return { kind: "error", text: `\u627E\u4E0D\u5230\u5458\u5DE5\u300C${who}\u300D\u3002\u540D\u518C\uFF1A${roster === "" ? "\uFF08\u7A7A\uFF09" : roster}` };
        }
        const result = await service.dispatch(BOARD, {
          employeeId: target.id,
          title: task.length > 60 ? `${task.slice(0, 60)}\u2026` : task,
          desc: task,
          projectId: target.projectIds[0] ?? null,
          priority: 1
        });
        if (!result.ok || result.data === void 0) return { kind: "error", text: result.message ?? "\u6D3E\u6D3B\u5931\u8D25" };
        const project = result.data.projectId === null ? void 0 : service.projects().find((entry) => entry.id === result.data.projectId);
        const where = project === void 0 ? "\u300C\u4E00\u4EBA\u516C\u53F8 \xB7 \u5927\u5385\u300D" : `\u300C${project.name} \xB7 \u9879\u76EE\u7FA4\u300D`;
        return { kind: "success", text: `\u5DF2\u6D3E\u7ED9 ${target.name}\uFF08\u4EFB\u52A1 ${result.data.id}\uFF09\u3002\u5B8C\u6210\u540E\u7B80\u62A5\u4F1A\u53D1\u5230 ${where}\u3002` };
      } catch (error) {
        log(`/call \u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
        return { kind: "error", text: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}
function success(text) {
  return { kind: "success", text };
}
function failure(text) {
  return { kind: "error", text };
}

// src/host/injector.ts
function installRootInjector(ctx, service, isOurs, log) {
  const instrument = (agent) => {
    try {
      if (isOurs(agent.session.id)) return;
      agent.ctx.tools.register(buildCallTool(service));
      agent.ctx.systemPrompt.section({
        name: "onecompany-call",
        order: 70,
        text: callPromptSection(service)
      });
    } catch (error) {
      log(`\u6CE8\u5165\u4F1A\u8BDD ${agent.session.id} \u5931\u8D25\uFF1A${describe(error)}`);
    }
  };
  ctx.effect(() => ctx.on("agent/created", ({ agent }) => {
    if (!ctx.agents.roots().includes(agent)) return;
    instrument(agent);
  }), "onecompany: root injector");
  for (const agent of ctx.agents.roots()) {
    instrument(agent);
  }
}

// src/host/index.ts
var name = "onecompany";
var inject = ["timer", "storageDomain", "agents", "sessions", "tools", "commands", "systemPrompt", "sessionPersistence"];
var Config2 = Schema.object({
  companyRoot: Schema.string().default(""),
  companyName: Schema.string().default("\u4E00\u4EBA\u516C\u53F8"),
  tickMs: Schema.number().default(3e4),
  maxResidentAgents: Schema.number().default(8),
  defaultDailyTokenCap: Schema.number().default(5e6),
  approvalsRequired: Schema.array(Schema.string()).default(["hire", "spend", "strategy", "danger"]),
  timeZone: Schema.string().default("Asia/Shanghai"),
  autoProvision: Schema.boolean().default(true),
  kickoffOnCreate: Schema.boolean().default(true)
});
async function apply(ctx, config) {
  const log = (message) => {
    console.log(`[onecompany] ${message}`);
    ctx.logger?.info?.(`[onecompany] ${message}`);
  };
  const root = resolveRoot(config.companyRoot);
  const paths = await ensurePaths(root);
  const domain = await ctx.storageDomain.open(companyDomainSpec);
  const readBundledPersona = async (file) => readFile2(new URL(`../agents/${file}`, import.meta.url), "utf8");
  let workspaceRegistry;
  const titleForSession = (sessionId) => {
    const record = service.agents().find((entry) => entry.sessionId === sessionId);
    if (record !== void 0) return record.role === "ceo" ? "\u4E00\u4EBA\u516C\u53F8" : `${record.name} \xB7 \u5DE5\u4F4D`;
    const project = service.projects().find((entry) => entry.channelSessionId === sessionId);
    return project === void 0 ? void 0 : `${project.name} \xB7 \u9879\u76EE\u7FA4`;
  };
  const attachSessionToWorkspace = async (session, title) => {
    if (workspaceRegistry === void 0) {
      workspaceRegistry = ctx.get("workspaceRegistry");
    }
    if (workspaceRegistry === void 0) return;
    const cwd = session.header.cwd;
    if (cwd === void 0) return;
    try {
      await ctx.sessions.flush(session);
      const workspace = await workspaceRegistry.resolveByPath(cwd) ?? await workspaceRegistry.create(cwd, title);
      const ws = workspace;
      const ownOnly = Array.isArray(ws.sessionIds) && ws.sessionIds.length === 1 && ws.sessionIds[0] === session.id;
      if (title !== void 0 && ownOnly && ws.title !== title && typeof ws.setTitle === "function") {
        await ws.setTitle(title);
        log(`\u5DE5\u4F5C\u533A\u6539\u540D\uFF1A${cwd.split("/").pop()} \u2192 ${title}`);
      }
      await workspace.attachSession(session.id);
    } catch (error) {
      log(`\u4F1A\u8BDD ${session.id} \u5F52\u5165\u5DE5\u4F5C\u533A\u5931\u8D25\uFF1A${describe(error)}`);
    }
  };
  const attachLiveCompanySessions = async () => {
    const store = ctx.get("sessions");
    if (store === void 0) return;
    const ids = /* @__PURE__ */ new Set();
    for (const record of service.agents()) ids.add(record.sessionId);
    for (const project of service.projects()) {
      if (project.channelSessionId !== null) ids.add(project.channelSessionId);
    }
    for (const id of ids) {
      const session = store.get(id);
      if (session === void 0) continue;
      await attachSessionToWorkspace(session, titleForSession(id));
    }
  };
  let driver;
  const service = new CompanyService({
    ctx,
    domain,
    paths,
    config: {
      tickMs: config.tickMs,
      defaultDailyTokenCap: config.defaultDailyTokenCap,
      approvalsRequired: config.approvalsRequired,
      timeZone: config.timeZone,
      companyName: config.companyName
    },
    deliver: async (record, text, notice) => {
      if (driver === void 0) throw new Error("\u5458\u5DE5\u9A71\u52A8\u5C1A\u672A\u5C31\u7EEA");
      await driver.deliver(record, text, notice);
    },
    deliverChannel: async (project, text, notice) => {
      if (driver === void 0) throw new Error("\u5458\u5DE5\u9A71\u52A8\u5C1A\u672A\u5C31\u7EEA");
      await driver.deliverChannel(project, text, notice);
    },
    warmChannels: async () => {
      if (driver === void 0) return;
      if (!config.autoProvision) return;
      const ceo = service.ceo();
      if (ceo !== void 0) await driver.ensure(ceo);
      for (const project of service.projects()) await driver.ensureChannel(project);
    },
    fixTitles: async () => {
      if (driver === void 0) return;
      await driver.fixTitles(service.agents());
    },
    readBundledPersona,
    stopResident: async (agentId) => {
      await driver?.stop(agentId);
    },
    stopAllResidents: async () => {
      await driver?.stopAll();
    },
    residentIds: () => driver?.residentIds() ?? [],
    log
  });
  const composeEmployee = (record) => {
    const tools = buildCompanyTools(service, record.id);
    const extras = record.role === "ceo" || record.permissions.canApprove ? buildCeoExtras(service, record.id) : [];
    return {
      tools: [...tools, ...extras],
      prompt: () => service.employeePrompt(record.id),
      presetId: record.presetId
    };
  };
  const composeChannel = (project) => ({
    tools: buildChannelTools(service),
    prompt: () => service.channelPrompt(project.id),
    presetId: null
  });
  const composeHall = (record) => ({
    tools: [...buildCompanyTools(service, record.id), ...buildCeoExtras(service, record.id)],
    prompt: () => service.hallPrompt(),
    presetId: record.presetId
  });
  driver = new AgentDriver({
    ctx,
    composeEmployee,
    composeChannel,
    composeHall,
    markProvisioned: async (agentId) => {
      await service.markProvisioned(agentId);
    },
    markChannel: async (projectId, sessionId) => {
      await service.markChannel(projectId, sessionId);
    },
    attachWorkspace: async (agent) => {
      const sessionId = agent.session.id;
      const record = service.agents().find((entry) => entry.sessionId === sessionId);
      const project = service.projects().find((entry) => entry.channelSessionId === sessionId);
      const title = record?.role === "ceo" ? "\u4E00\u4EBA\u516C\u53F8" : project?.name;
      await attachSessionToWorkspace(agent.session, title);
    },
    defaultModel: () => {
      const selection = ctx.get("agentDefaultModel");
      if (selection === void 0) return void 0;
      try {
        const current = selection.currentSelection();
        return { provider: current.provider, model: current.model, ...current.reasoningEffort === void 0 ? {} : { reasoningEffort: String(current.reasoningEffort) } };
      } catch {
        return void 0;
      }
    },
    maxResident: Math.max(1, config.maxResidentAgents),
    kickoff: (kind, label) => {
      if (!config.kickoffOnCreate) return "";
      if (kind === "hall") return "\u3010\u516C\u53F8\u5927\u5385\u5DF2\u5C31\u7EEA\u3011\u8BF7\u7528\u4E00\u53E5\u8BDD\u5411\u8463\u4E8B\u4F1A\u81EA\u6211\u4ECB\u7ECD\uFF08\u4F60\u7684\u540D\u5B57\u300C\u53F8\u5357\u300D\u3001\u804C\u8D23\u3001\u5982\u4F55\u7ED9\u4F60\u6D3E\u6D3B\uFF09\uFF0C\u7136\u540E\u5F85\u547D\uFF0C\u4E0D\u8981\u8C03\u7528\u5DE5\u5177\u3002";
      if (kind === "channel") return `\u3010\u9879\u76EE\u7FA4\u5DF2\u5C31\u7EEA\u3011${label}\uFF1A\u8BF7\u7528\u4E00\u53E5\u8BDD\u8BF4\u660E\u672C\u7FA4\u7528\u9014\uFF08\u9879\u76EE\u3001\u5F53\u524D\u8FDB\u5EA6\u3001\u5982\u4F55\u6D3E\u6D3B\u7ED9\u56E2\u961F\uFF09\uFF0C\u7136\u540E\u5F85\u547D\uFF0C\u4E0D\u8981\u8C03\u7528\u5DE5\u5177\u3002`;
      return `\u3010\u5165\u804C\u786E\u8BA4\u3011${label}\uFF1A\u8BF7\u7528\u4E00\u53E5\u8BDD\u786E\u8BA4\u5230\u5C97\uFF08\u4F60\u7684\u540D\u5B57\u3001\u804C\u4F4D\u3001\u8D1F\u8D23\u9879\u76EE\u3001\u4F60\u4F1A\u600E\u4E48\u6C47\u62A5\uFF09\uFF0C\u7136\u540E\u5F85\u547D\uFF0C\u4E0D\u8981\u8C03\u7528\u5DE5\u5177\u3002`;
    },
    log
  });
  const global = domain.global.get();
  if (global.createdAt === 0) {
    await domain.global.set({ enabled: true, companyName: config.companyName, createdAt: Date.now() });
  } else if (global.companyName !== config.companyName) {
    await domain.global.set({ ...global, companyName: config.companyName });
  }
  ctx.inject(["workspaceRegistry"], (workspaceCtx) => {
    workspaceRegistry = workspaceCtx.workspaceRegistry;
    void attachLiveCompanySessions().catch((error) => log(`\u8865\u6302\u516C\u53F8\u4F1A\u8BDD\u5931\u8D25\uFF1A${describe(error)}`));
  });
  registerCompanyCommand(ctx, service, log);
  registerCallCommand(ctx, service, log);
  installRootInjector(ctx, service, (sessionId) => service.isCompanySession(sessionId), log);
  ctx.on("llm/stream", (options, next) => {
    const downstream = next();
    return async function* onecompanyUsage() {
      let usage;
      try {
        for await (const chunk of downstream) {
          const candidate = chunk;
          if (candidate.type === "usage" && candidate.usage !== void 0) usage = candidate.usage;
          yield chunk;
        }
      } finally {
        if (usage !== void 0) {
          void service.foldUsage(options?.sessionId, usage).catch((error) => {
            log(`token \u8BA1\u91CF\u5931\u8D25\uFF1A${describe(error)}`);
          });
        }
      }
    }();
  });
  ctx.on("session/event", (session, event) => {
    void service.foldEvent(session.id, event).catch((error) => {
      log(`\u5DE5\u4F5C\u65E5\u5FD7\u6298\u53E0\u5931\u8D25\uFF1A${describe(error)}`);
    });
  });
  ctx.effect(() => {
    service.startTimers();
    return async () => {
      service.stopTimers();
      await driver?.stopAll();
      await domain.close();
    };
  }, "onecompany: lifecycle");
  Object.defineProperty(service, "typertRemote", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service, serviceKey: "company", namespace: "company" }
  });
  ctx.provide("company", service);
  const state = service.snapshot();
  log(`\u5DF2\u52A0\u8F7D\uFF1A${state.companyName} \xB7 \u6839\u76EE\u5F55 ${paths.root} \xB7 \u5458\u5DE5 ${state.agents.length} \u4EBA \xB7 ${state.enabled ? "\u8FD0\u884C\u4E2D" : "\u5DF2\u505C\u7528"}`);
  if (state.enabled) {
    void service.reconcile().then(() => log("reconcile \u5B8C\u6210")).catch((error) => log(`reconcile \u5931\u8D25\uFF1A${describe(error)}`));
    void service.tick();
  }
}
export {
  CompanyService,
  Config2 as Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
