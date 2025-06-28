import { EtherType } from "./frame.js";
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
export function concat(...uint8arrays) {
    const totalLength = uint8arrays.reduce((total, uint8array) => total + uint8array.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    uint8arrays.forEach((uint8array) => {
        result.set(uint8array, offset);
        offset += uint8array.byteLength;
    });
    return result;
}
/**
 * Spreads numbers across a certain number of bits, merges them together, and splits them into an array of bytes
 * @param pairs Any number of [number to spread, number of bits to spread across] tuples
 * @returns The spread-out array of bytes
 */
export function spread(...pairs) {
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
/**
 * Redraws the boundaries in an array of bytes
 * @param arr The array of bytes to divide
 * @param divisions A number array containing the lengths in bits of each division
 * @returns The divided array
 */
export function divide(arr, divisions) {
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
/**
 * Limits the value of a number to a certain number of bits, taking from the least-significant side
 * @param num The number to limit
 * @param bits The number of bits to limit to
 * @returns The limited number
 */
export function limit(num, bits) {
    return num & (2 ** bits - 1);
}
/**
 * Pads an array of bytes on the left to ensure that its length is a multiple of 4 bytes
 * @param arr The number array to pad
 * @param min_bytes The minimum number of bytes in the output (Default: 0)
 * @param max_bytes The maximum number of bytes in the output (Default: 40)
 * @returns Array of bytes with the left side padded
 */
export function padTo32BitWords(arr, min_bytes = 0, max_bytes = 40) {
    return Array(Math.max(Math.ceil(arr.length / 4) * 4, min_bytes) - arr.length).fill(0).concat(arr).slice(0, max_bytes);
}
export class DeviceID {
    constructor(value) {
        value = value > DeviceID.max ? DeviceID.max : value < DeviceID.min ? DeviceID.min : Math.trunc(value);
        this.value = value;
    }
    static rand() {
        return Math.floor(Math.random() * (this.max - this.min + 1)) + this.min;
    }
    compare(other) {
        return this.value - other.value;
    }
}
DeviceID.min = 100000000;
DeviceID.max = 999999999;
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
export class MacAddress {
    constructor(arr) {
        this.value = new Uint8Array(6);
        this.value = this.value.map((ele, idx) => (ele = arr[idx]));
    }
    static get broadcast() {
        return new MacAddress([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
    }
    static get loopback() {
        return new MacAddress([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    }
    static rand() {
        let valid = false;
        let macArr;
        while (!valid) {
            macArr = [
                Math.trunc(Math.random() * 256), Math.trunc(Math.random() * 256),
                Math.trunc(Math.random() * 256), Math.trunc(Math.random() * 256),
                Math.trunc(Math.random() * 256), Math.trunc(Math.random() * 256)
            ];
            if (!macArr.every((x) => x == 0x00) && !macArr.every((x) => x == 0xFF)) {
                valid = true;
            }
        }
        return new MacAddress(macArr);
    }
    /**
     * Parses a string to create a MacAddress object
     * @param str the string to parse
     * @returns a MacAddress object of the string, if the string is valid, or undefined otherwise
     */
    static parseString(str) {
        const arr = str.split(':');
        if (arr.length != 6) {
            return null;
        }
        let num_arr = [0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 6; i++) {
            const parsed = parseInt(arr[i], 16);
            if (isNaN(parsed) || parsed < 0 || parsed > 255) {
                return null;
            }
            num_arr[i] = parsed;
        }
        return new MacAddress(num_arr);
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
    isLoopback() {
        return this.compare(MacAddress.loopback) == 0;
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
MacAddress.byteLength = 6;
export class Ipv4Address {
    constructor(arr) {
        this._value = new Uint8Array(4);
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }
    set value(arr) {
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
        console.log(`address set to ${this}`);
    }
    get value() {
        return this._value;
    }
    get ethertype() {
        return EtherType.IPv4;
    }
    static get broadcast() {
        return new Ipv4Address([255, 255, 255, 255]);
    }
    isBroadcast() {
        return this.compare(Ipv4Address.broadcast) == 0;
    }
    toBinary() {
        // return Array.from(this._value).map((x) => (x).toString(2).padStart(8, "0")).join("");
        return this._value.toBinary();
    }
    toArray() {
        return this._value.toArray();
    }
    toTuple() {
        return [this._value[0], this._value[1], this._value[2], this._value[3]];
    }
    toString() {
        return Array.from(this._value).map((x) => (x).toString()).join(".");
    }
    and(prefix) {
        const anded = this._value.map((x, idx) => x & prefix.mask._value[idx]);
        return new Ipv4Address([anded[0], anded[1], anded[2], anded[3]]);
    }
    broadcastAddress(prefix) {
        const ored = this._value.map((x, idx) => x | (0xff - prefix.mask._value[idx]));
        return new Ipv4Address([ored[0], ored[1], ored[2], ored[3]]);
    }
    /**
     * Creates a copy of the current IPv4 address and increments it by 1.
     * If the current IPv4 address is 255.255.255.255, an identical copy is returned.
     * @returns a copy of the current IPv4 address, incremented by 1
     */
    inc() {
        if (this.isBroadcast()) {
            return Ipv4Address.broadcast;
        }
        const incremented_ipv4 = new Ipv4Address([this._value[0], this._value[1], this._value[2], this._value[3]]);
        for (let i = 3; i >= 0; i--) {
            if (incremented_ipv4._value[i] == 0xff) {
                incremented_ipv4._value[i] = 0;
                continue;
            }
            incremented_ipv4._value[i]++;
            return incremented_ipv4;
        }
        return Ipv4Address.broadcast;
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
    /**
     * Parses a string to create an Ipv4Address object
     * @param str the string to parse
     * @returns an Ipv4Address object of the string, if the string is valid, or undefined otherwise
     */
    static parseString(str) {
        let arr = str.split('.');
        if (arr.length != 4) {
            return null;
        }
        let num_arr = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            const parsed = parseInt(arr[i]);
            if (isNaN(parsed) || parsed < 0 || parsed > 255) {
                return null;
            }
            num_arr[i] = parsed;
        }
        return new Ipv4Address(num_arr);
    }
}
Ipv4Address.byteLength = 4;
export class Ipv4Prefix {
    constructor(ipv4_prefix) {
        this._ipv4_prefix = ipv4_prefix & 0x3F;
    }
    set value(ipv4_prefix) {
        this._ipv4_prefix = ipv4_prefix & 0x3F;
        console.log(`prefix set to ${this._ipv4_prefix}`);
    }
    get value() {
        return this._ipv4_prefix;
    }
    get mask() {
        let arr = spread([Math.pow(2, 32 - this._ipv4_prefix) - 1, 32]);
        return new Ipv4Address([255 - arr[0], 255 - arr[1], 255 - arr[2], 255 - arr[3]]);
    }
    toString() {
        return this._ipv4_prefix.toString();
    }
}
function main() {
    let test = new Uint8(10);
    console.log(`${test}\t${test.toBinary()}`);
    test.value = 255;
    console.log(`${test}\t${test.toBinary()}`);
    test.value = 300.7;
    console.log(`${test}\t${test.toBinary()}`);
    let testmac = new MacAddress([0x9c, 0x00, 0xcd, 0x61, 0x39, 0x48]);
    console.log(`${testmac}\t${testmac.toBinary().match(/.{1,4}/g)?.join(' ')}`);
    let testipv4 = new Ipv4Address([192, 168, 0, 10]);
    console.log(`${testipv4}\t\t${testipv4.toBinary().match(/.{1,4}/g)?.join(' ')}`);
    let testuint8array = new Uint8Array([1, 4, 8, 16]);
    console.log(`${testuint8array}\t\t${testuint8array.toBinary()}`);
}
// main();
//# sourceMappingURL=addressing.js.map