"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ipv4Prefix = exports.Ipv4Address = exports.MacAddress = exports.DeviceID = exports.padTo32BitWords = exports.limit = exports.divide = exports.spread = exports.concat = void 0;
const frame_1 = require("./frame");
Uint8Array.prototype.toHex = function () {
    return Array.from(this).map((x) => Number(x).toString(16).padStart(2, "0")).join(" ");
};
Uint8Array.prototype.toBinary = function () {
    return Array.from(this).map((x) => Number(x).toString(2).padStart(8, "0")).join("");
};
Uint8Array.prototype.toArray = function () {
    return Array.from(this).map((x) => Number(x));
};
Uint8Array.prototype.toNumber = function () {
    let num = 0;
    for (let i = 0; i < this.length; i++) {
        num += this[i] * 2 ** (8 * (this.length - i - 1));
    }
    return num;
};
Uint8Array.prototype.toBigInt = function () {
    let num = BigInt(0);
    for (let i = 0; i < this.length; i++) {
        num += BigInt(this[i] * 2 ** (8 * (this.length - i - 1)));
    }
    return num;
};
// https://evanhahn.com/the-best-way-to-concatenate-uint8arrays/
/**
 * Concatenates multiple Uint8Arrays
 * @param uint8arrays the arrays to concatenate
 * @returns Concatenated Uint8Array
 */
function concat(...uint8arrays) {
    const totalLength = uint8arrays.reduce((total, uint8array) => total + uint8array.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    uint8arrays.forEach((uint8array) => {
        result.set(uint8array, offset);
        offset += uint8array.byteLength;
    });
    return result;
}
exports.concat = concat;
function spread(...pairs) {
    const values = pairs.map(x => x[0]);
    const bits = pairs.map(x => x[1]);
    const bytes = Math.floor(bits.reduce((sum, current) => sum + current, 0) / 8);
    const size = pairs.length;
    let output = Array(bytes);
    let current_size = 0;
    let current_ele = 0;
    let i = 0, j = 0;
    while (i < size) {
        const bits_to_push = Math.min(bits[i], 8 - current_size);
        const shift_amount = (bits_to_push >= 8) ? (bits[i] - bits_to_push) : (bits_to_push - (8 - current_size));
        const value_to_push = Math.floor(values[i] * (2 ** -shift_amount));
        current_size += bits_to_push;
        if (current_size == 8) {
            output[j++] = (current_ele + value_to_push);
            current_ele = 0;
            current_size = 0;
        }
        else if (current_size > 8) {
            throw Error("byte cannot exceed 8 bits. there is an error in this function.");
        }
        else {
            current_ele += value_to_push;
        }
        values[i] -= Math.floor(value_to_push * (2 ** shift_amount));
        // console.log(`${value_to_push} ${shift_amount} ${values[i]}`)
        bits[i] -= bits_to_push;
        if (bits[i] == 0) {
            i++;
        }
    }
    if (current_size > 0) {
        output.push(current_ele);
    }
    return output;
}
exports.spread = spread;
function divide(arr, divisions) {
    let num = arr.toBigInt();
    let bits_remaining = arr.length * 8;
    let output = [];
    for (let division of divisions) {
        bits_remaining = Math.max(bits_remaining - division, 0);
        output.push(Number(num / BigInt(2 ** bits_remaining)));
        num &= BigInt(2 ** bits_remaining) - BigInt(1);
    }
    if (bits_remaining > 0) {
        let remaining_divisions = Array(Math.ceil(bits_remaining / 8)).fill(8);
        const last_division = bits_remaining % 8;
        remaining_divisions[remaining_divisions.length - 1] = last_division == 0 ? 8 : last_division;
        for (let division of remaining_divisions) {
            bits_remaining = Math.max(bits_remaining - division, 0);
            output.push(Number(num / BigInt(2 ** bits_remaining)));
            num &= BigInt(2 ** bits_remaining) - BigInt(1);
        }
    }
    return output;
}
exports.divide = divide;
function limit(num, bits) {
    return num & (2 ** bits - 1);
}
exports.limit = limit;
function padTo32BitWords(arr) {
    return Array(Math.ceil(arr.length / 4) * 4 - arr.length).fill(0).concat(arr).slice(0, 40);
}
exports.padTo32BitWords = padTo32BitWords;
class DeviceID {
    constructor(value) {
        value = value > DeviceID.max ? DeviceID.max : value < DeviceID.min ? DeviceID.min : Math.trunc(value);
        this.value = value;
    }
    static rand() {
        return Math.floor(Math.random() * (this.max - this.min)) + this.min;
    }
    compare(other) {
        return this.value - other.value;
    }
}
exports.DeviceID = DeviceID;
DeviceID.min = 100000000;
DeviceID.max = 1000000000;
class Uint8 {
    constructor(value) {
        this._value = value & 0xFF;
    }
    set value(value) {
        this._value = value & 0xFF;
    }
    get value() {
        return this._value;
    }
    toBinary() {
        return this._value.toString(2).padStart(8, "0");
    }
    toString() {
        return this._value;
    }
}
class MacAddress {
    constructor(arr) {
        this.value = new Uint8Array(6);
        this.value = this.value.map((ele, idx) => (ele = arr[idx]));
    }
    static get byteLength() {
        return 6;
    }
    static get broadcast() {
        return new MacAddress([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
    }
    static rand() {
        let valid = false;
        let macArr;
        while (!valid) {
            macArr = [
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)
            ];
            if (!macArr.every((x) => x == 0xFF)) {
                valid = true;
            }
        }
        return new MacAddress(macArr);
    }
    compare(other) {
        for (let i = 0; i < 6; i++) {
            if (this.value[i] > other.value[i]) {
                return 1;
            }
            else if (this.value[i] < other.value[i]) {
                return -1;
            }
        }
        return 0;
    }
    isBroadcast() {
        return this.compare(MacAddress.broadcast) == 0;
    }
    toBinary() {
        return Array.from(this.value).map((x) => (x).toString(2).padStart(8, "0")).join("");
    }
    toArray() {
        return this.value.toArray();
    }
    toString() {
        return Array.from(this.value).map((x) => (x).toString(16).padStart(2, "0")).join(":");
    }
}
exports.MacAddress = MacAddress;
class Ipv4Address {
    constructor(arr) {
        this._value = new Uint8Array(4);
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }
    set value(arr) {
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }
    get value() {
        return new Uint8Array(this._value);
    }
    get ethertype() {
        return frame_1.EtherType.IPv4;
    }
    static get byteLength() {
        return 4;
    }
    toBinary() {
        // return Array.from(this._value).map((x) => (x).toString(2).padStart(8, "0")).join("");
        return this._value.toBinary();
    }
    toArray() {
        return this._value.toArray();
    }
    toString() {
        return Array.from(this._value).map((x) => (x).toString()).join(".");
    }
    and(prefix) {
        const anded = this._value.map((x, idx) => x & prefix.mask[idx]);
        return new Ipv4Address([anded[0], anded[1], anded[2], anded[3]]);
    }
    compare(other) {
        for (let i = 0; i < 4; i++) {
            if (this.value[i] > other.value[i]) {
                return 1;
            }
            else if (this.value[i] < other.value[i]) {
                return -1;
            }
        }
        return 0;
    }
}
exports.Ipv4Address = Ipv4Address;
class Ipv4Prefix {
    constructor(ipv4_prefix) {
        this._ipv4_prefix = ipv4_prefix & 0x3F;
    }
    set value(ipv4_prefix) {
        this._ipv4_prefix = ipv4_prefix & 0x3F;
    }
    get value() {
        return this._ipv4_prefix;
    }
    get mask() {
        let arr = spread([Math.pow(2, 32 - this._ipv4_prefix) - 1, 32]);
        return new Ipv4Address([255 - arr[0], 255 - arr[1], 255 - arr[2], 255 - arr[3]]);
    }
}
exports.Ipv4Prefix = Ipv4Prefix;
function main() {
    let test = new Uint8(10);
    console.log(`${test}\t${test.toBinary()}`);
    test.value = 255;
    console.log(`${test}\t${test.toBinary()}`);
    test.value = 300.7;
    console.log(`${test}\t${test.toBinary()}`);
    let testmac = new MacAddress([0x9c, 0x00, 0xcd, 0x61, 0x39, 0x48]);
    console.log(`${testmac}\t${testmac.toBinary().match(/.{1,4}/g).join(' ')}`);
    let testipv4 = new Ipv4Address([192, 168, 0, 10]);
    console.log(`${testipv4}\t\t${testipv4.toBinary().match(/.{1,4}/g).join(' ')}`);
    let testuint8array = new Uint8Array([1, 4, 8, 16]);
    console.log(`${testuint8array}\t\t${testuint8array.toBinary()}`);
}
// main();
//# sourceMappingURL=addressing.js.map