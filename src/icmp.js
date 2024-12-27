"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IcmpDatagram = exports.IcmpUnreachableCode = exports.IcmpControlMessage = void 0;
const addressing_1 = require("./addressing");
const ip_1 = require("./ip");
var IcmpControlMessage;
(function (IcmpControlMessage) {
    IcmpControlMessage[IcmpControlMessage["ECHO_REPLY"] = 0] = "ECHO_REPLY";
    IcmpControlMessage[IcmpControlMessage["UNREACHABLE"] = 3] = "UNREACHABLE";
    IcmpControlMessage[IcmpControlMessage["ECHO_REQUEST"] = 8] = "ECHO_REQUEST";
    IcmpControlMessage[IcmpControlMessage["TIME_EXCEEDED"] = 11] = "TIME_EXCEEDED";
})(IcmpControlMessage || (exports.IcmpControlMessage = IcmpControlMessage = {}));
var IcmpUnreachableCode;
(function (IcmpUnreachableCode) {
    IcmpUnreachableCode[IcmpUnreachableCode["NET"] = 0] = "NET";
    IcmpUnreachableCode[IcmpUnreachableCode["HOST"] = 1] = "HOST";
})(IcmpUnreachableCode || (exports.IcmpUnreachableCode = IcmpUnreachableCode = {}));
class IcmpDatagram {
    // RFC 792
    constructor(type, code, extra_space, data = [], checksum) {
        this._checksum = new Uint8Array(2);
        this.type = (0, addressing_1.limit)(type, 8);
        this.code = (0, addressing_1.limit)(code, 8);
        this.extra_space = new Uint8Array((0, addressing_1.padTo32BitWords)(extra_space, 4).slice(-4));
        const space_taken = IcmpDatagram._bytes_before_data + data.length;
        this.data = (0, addressing_1.concat)(new Uint8Array(data), IcmpDatagram.generateRandomBytes(64 - space_taken));
        let datagram = (0, addressing_1.concat)(new Uint8Array((0, addressing_1.spread)([this.type, IcmpDatagram._lengths[0]], [this.code, IcmpDatagram._lengths[1]])), this._checksum, this.extra_space, this.data);
        const checksum_num = checksum ?? ip_1.Ipv4Packet.calculateChecksum(datagram);
        this._checksum = new Uint8Array((0, addressing_1.spread)([checksum_num, 16]));
        datagram[2] = this._checksum[0];
        datagram[3] = this._checksum[1];
        this.datagram = datagram;
    }
    matchesRequest(other) {
        return other.isEchoRequest && other.extra_space.every((val, idx) => val == this.extra_space[idx]);
    }
    get isEchoRequest() {
        return this.type == IcmpControlMessage.ECHO_REQUEST;
    }
    get isEchoReply() {
        return this.type == IcmpControlMessage.ECHO_REPLY;
    }
    static echoRequest(identifier, seq_num) {
        return new IcmpDatagram(IcmpControlMessage.ECHO_REQUEST, 0, [...(0, addressing_1.spread)([(0, addressing_1.limit)(identifier, 16), 16]), ...(0, addressing_1.spread)([(0, addressing_1.limit)(seq_num, 16), 16])]);
    }
    static echoReply(echo_request) {
        return new IcmpDatagram(IcmpControlMessage.ECHO_REPLY, 0, echo_request.extra_space.toArray(), echo_request.data.toArray());
    }
    static hostUnreachable(echo_request, ipv4_packet) {
        return new IcmpDatagram(IcmpControlMessage.UNREACHABLE, IcmpUnreachableCode.HOST, [], (0, addressing_1.concat)(ipv4_packet.header, echo_request.datagram.slice(0, 64)).toArray());
    }
    static netUnreachable(echo_request, ipv4_packet) {
        return new IcmpDatagram(IcmpControlMessage.UNREACHABLE, IcmpUnreachableCode.NET, [], (0, addressing_1.concat)(ipv4_packet.header, echo_request.datagram.slice(0, 64)).toArray());
    }
    static timeExceeded(echo_request, ipv4_packet) {
        return new IcmpDatagram(IcmpControlMessage.TIME_EXCEEDED, 0, [], (0, addressing_1.concat)(ipv4_packet.header, echo_request.datagram.slice(0, 64)).toArray());
    }
    static verifyChecksum(datagram) {
        return ip_1.Ipv4Packet.calculateChecksum(datagram.datagram) == 0;
    }
    static parse(datagram) {
        const divided = (0, addressing_1.divide)(datagram, IcmpDatagram._lengths);
        return new IcmpDatagram(divided[0], divided[1], [divided[3], divided[4], divided[5], divided[6]], divided.slice(7), divided[2]);
    }
    static generateRandomBytes(bytes) {
        let output = new Uint8Array(Math.max(0, bytes));
        for (let i = 0; i < bytes; i++) {
            output[i] = 16 + i;
        }
        return output;
    }
}
exports.IcmpDatagram = IcmpDatagram;
IcmpDatagram._lengths = [8, 8, 16, 8, 8, 8, 8];
IcmpDatagram._bytes_before_data = 8;
//# sourceMappingURL=icmp.js.map