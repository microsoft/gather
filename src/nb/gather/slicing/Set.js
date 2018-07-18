var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Set = /** @class */ (function () {
        // Two items A and B are considered the same value iff getIdentifier(A) === getIdentifier(B).
        function Set(getIdentifier) {
            var items = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                items[_i - 1] = arguments[_i];
            }
            this.getIdentifier = getIdentifier;
            this._items = {};
            this.getIdentifier = getIdentifier;
            this._items = {};
            this.add.apply(this, items);
        }
        Object.defineProperty(Set.prototype, "size", {
            get: function () { return this.items.length; },
            enumerable: true,
            configurable: true
        });
        Set.prototype.add = function () {
            var _this = this;
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            items.forEach(function (item) {
                return _this._items[_this.getIdentifier(item)] = item;
            });
        };
        Set.prototype.remove = function (item) {
            delete this._items[this.getIdentifier(item)];
        };
        Set.prototype.contains = function (item) {
            return this._items[this.getIdentifier(item)] != undefined;
        };
        Object.defineProperty(Set.prototype, "items", {
            get: function () {
                var _this = this;
                return Object.keys(this._items).map(function (k) { return _this._items[k]; });
            },
            enumerable: true,
            configurable: true
        });
        Set.prototype.equals = function (that) {
            return this.size == that.size && this.items.every(function (item) { return that.contains(item); });
        };
        Object.defineProperty(Set.prototype, "empty", {
            get: function () {
                return Object.keys(this._items).length == 0;
            },
            enumerable: true,
            configurable: true
        });
        Set.prototype.union = function () {
            var those = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                those[_i] = arguments[_i];
            }
            return new (Set.bind.apply(Set, [void 0, this.getIdentifier].concat((_a = this.items).concat.apply(_a, those.map(function (that) { return that.items; })))))();
            var _a;
        };
        Set.prototype.intersect = function (that) {
            return new (Set.bind.apply(Set, [void 0, this.getIdentifier].concat(this.items.filter(function (item) { return that.contains(item); }))))();
        };
        Set.prototype.filter = function (predicate) {
            return new (Set.bind.apply(Set, [void 0, this.getIdentifier].concat(this.items.filter(predicate))))();
        };
        Set.prototype.map = function (getIdentifier, transform) {
            return new (Set.bind.apply(Set, [void 0, getIdentifier].concat(this.items.map(transform))))();
        };
        Set.prototype.minus = function (that) {
            return new (Set.bind.apply(Set, [void 0, this.getIdentifier].concat(this.items.filter(function (x) { return !that.contains(x); }))))();
        };
        Set.prototype.take = function () {
            if (this.empty) {
                throw 'cannot take from an empty set';
            }
            var first = parseInt(Object.keys(this._items)[0]);
            var result = this._items[first];
            this.remove(result);
            return result;
        };
        return Set;
    }());
    exports.Set = Set;
    var StringSet = /** @class */ (function (_super) {
        __extends(StringSet, _super);
        function StringSet() {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            return _super.apply(this, [function (s) { return s; }].concat(items)) || this;
        }
        return StringSet;
    }(Set));
    exports.StringSet = StringSet;
    var NumberSet = /** @class */ (function (_super) {
        __extends(NumberSet, _super);
        function NumberSet() {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            return _super.apply(this, [function (n) { return n.toString(); }].concat(items)) || this;
        }
        return NumberSet;
    }(Set));
    exports.NumberSet = NumberSet;
    function range(min, max) {
        var numbers = [];
        for (var i = min; i < max; i++) {
            numbers.push(i);
        }
        return new (NumberSet.bind.apply(NumberSet, [void 0].concat(numbers)))();
    }
    exports.range = range;
});
