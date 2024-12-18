"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ipv4Packet = exports.Ipv4Address = exports.MacAddress = exports.DeviceID = void 0;
Uint8Array.prototype.toBinary = function () {
    return Array.from(this).map((x) => Number(x).toString(2).padStart(8, "0")).join("");
};
class DeviceID {
    get value() {
        return this._value;
    }
    compare(other) {
        return this._value - other._value;
    }
}
exports.DeviceID = DeviceID;
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
        this._value = new Uint8Array(6);
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }
    set value(arr) {
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }
    get value() {
        return this._value;
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
    toBinary() {
        return Array.from(this._value).map((x) => (x).toString(2).padStart(8, "0")).join("");
    }
    toString() {
        return Array.from(this._value).map((x) => (x).toString(16).padStart(2, "0")).join(":");
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
        return this._value;
    }
    toBinary() {
        // return Array.from(this._value).map((x) => (x).toString(2).padStart(8, "0")).join("");
        return this._value.toBinary();
    }
    toString() {
        return Array.from(this._value).map((x) => (x).toString()).join(".");
    }
}
exports.Ipv4Address = Ipv4Address;
class Ipv4Packet {
    constructor(sourceIPv4, destinationIPv4) {
        this._header = new Uint8Array(20);
        this._header[0] = (4 << 4) + (5 /* + options.length/4 */);
        this._header[1] = 0; // temp
        // splitting total length into two bytes
        this._header[2] = (20 /* + options.length + data.length*/) >> 8;
        this._header[3] = (20 /* + options.length + data.length*/) & 0b11111111;
        // there's more
        sourceIPv4.value.forEach((ele, idx) => (this._header[12 + idx] = ele));
        destinationIPv4.value.forEach((ele, idx) => (this._header[16 + idx] = ele));
    }
    get packet_length() {
        return (this._header[2] << 8) + this._header[3];
    }
}
exports.Ipv4Packet = Ipv4Packet;
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