import { ArpPacket, OP } from "../protocols/arp.js";
import { EtherType } from "../frame.js";
import { IcmpControlMessage, IcmpDatagram, IcmpUnreachableCode } from "../protocols/icmp.js";
import { InternetProtocolNumbers, Ipv4Packet } from "../protocols/ip.js";
import { Protocol } from "../socket.js";
export function getExplanation(frame) {
    const ethertype = frame.ethertype;
    let type = "";
    let from = "";
    let to = "";
    let description = "";
    let protocol;
    let extra_fields_name = [];
    let extra_fields_val = [];
    if (ethertype <= EtherType.IEEE802dot3_Upper) {
    }
    else if (ethertype == EtherType.ARP) {
        protocol = Protocol.ARP;
        const packet = ArpPacket.parsePacket(frame.packet);
        from = packet.src_pa.toString();
        to = packet.dest_pa.toString();
        switch (packet.op) {
            case OP.REQUEST:
                type = 'Request';
                description = `Requesting the MAC address of the interface which has IP address ${to}`;
                break;
            case OP.REPLY:
                type = 'Reply';
                description = `IP address ${from} has MAC address ${packet.src_ha}`;
                break;
            default:
                description = "ARP Packet with unknown operation";
                break;
        }
    }
    else if (ethertype == EtherType.IPv4) {
        protocol = Protocol.IPv4;
        const packet = Ipv4Packet.parsePacket(frame.packet);
        extra_fields_name.push("TTL");
        extra_fields_val.push(packet.ttl.toString());
        from = packet.src.toString();
        to = packet.dest.toString();
        switch (packet.protocol) {
            case InternetProtocolNumbers.ICMP:
                protocol = Protocol.ICMP;
                [type, description] = getICMPExplanation(packet);
                break;
            case InternetProtocolNumbers.UDP:
                protocol = Protocol.UDP;
                // TODO: ADD INFO FOR UDP
                break;
        }
    }
    let extra_info = "";
    for (let i = 0; i < extra_fields_name.length; i++) {
        extra_info += `<div class="packet-field-${extra_fields_name[i].toLowerCase().replace(/\s/g, '-')}">${extra_fields_val[i]}</div>\n`;
    }
    let explanation = `
    <div class="packet-type packet-type-${type.toLowerCase().replace(/\s/g, '-')}">${type}</div>
    <div class="packet-params">
        <div class="packet-from">${from}</div>
        <div class="packet-to">${to}</div>
        ${extra_fields_name.length > 0 ? `<div class="packet-extra-info">${extra_info}</div>` : ''}
    </div>
    <div class="packet-description">${description}</div>
    `;
    return [protocol, explanation];
}
function getICMPExplanation(packet) {
    const icmp_datagram = IcmpDatagram.parse(packet.data);
    let type_str = "";
    let explanation = "";
    const type = icmp_datagram.type;
    const code = icmp_datagram.code;
    switch (type) {
        case IcmpControlMessage.ECHO_REQUEST:
            type_str = "Echo Request";
            explanation = `Device ${packet.src} is attempting to reach ${packet.dest}`;
            break;
        case IcmpControlMessage.ECHO_REPLY:
            type_str = "Echo Reply";
            explanation = `Device ${packet.src} is responding to ${packet.dest}'s request`;
            break;
        case IcmpControlMessage.TIME_EXCEEDED:
            type_str = "Time Exceeded";
            explanation = `Request expired in transit`;
            break;
        case IcmpControlMessage.UNREACHABLE:
            switch (code) {
                case IcmpUnreachableCode.HOST:
                    type_str = "Host Unreachable";
                    explanation = `Request could not be forwarded because ${packet.src} could not find the destination host`;
                    break;
                case IcmpUnreachableCode.NET:
                    type_str = "Network Unreachable";
                    explanation = `Request could not be forwarded because ${packet.src} could not find a route to the destination network`;
                    break;
                default:
                    type_str = "Unreachable";
                    break;
            }
            break;
        default:
            explanation = "ICMP Packet with unknown operation";
            break;
    }
    return [type_str, explanation];
}
//# sourceMappingURL=explain.js.map