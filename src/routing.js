import { Ipv4Prefix } from "./addressing.js";
export class RoutingTable {
    constructor() {
        /**
         * I'd also like to implement load balancing in some way.
         * E.g. the get(...) function could return an array of routes instead
         *      The "best" (lowest AD) routes would be included in this array
         */
        this._table = new Map();
    }
    // network address --> AD --> [remote_gateway, local_inf]
    /**
     * Adds a route to the routing table. Note that remote_gateway and local_inf must refer to the same path.
     * @param dest_ipv4 The destination network of the route
     * @param dest_prefix The destination CIDR prefix of the route
     * @param remote_gateway The next-hop gateway for the route (must be reachable through local_inf)
     * @param local_inf The interface out of which packets exit (must provide point towards remote_gateway)
     * @param administrative_distance The administrative distance (preference) of the route. A lower value indicates higher preference.
     * @returns
     */
    set(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance) {
        const key = dest_ipv4.and(dest_prefix).toString();
        const new_route = [remote_gateway, local_inf];
        // if the destination already has route(s), add the route only if it is new
        if (this._table.has(key)) {
            const routes = this._table.get(key).get(administrative_distance);
            for (let route of routes) {
                if (route[0] == new_route[0] && route[1] == new_route[1]) {
                    return false;
                }
            }
            routes.push(new_route);
        }
        // otherwise, add the route
        else {
            this._table.set(key, new Map()
                .set(administrative_distance, [[remote_gateway, local_inf]]));
        }
        return true;
    }
    /**
     * Gets an array of the lowest-cost routes to a destination IPv4 address
     * @param dest_ipv4 the destination IPv4 address of the route
     * @returns an array of (remote gateway, local interface) IPv4 address pairs
     */
    get(dest_ipv4) {
        for (let i = 32; i >= 0; i++) {
            const try_search = this._table.get(dest_ipv4.and(new Ipv4Prefix(i)).toString());
            if (try_search !== undefined) {
                const routes = try_search.get(Math.min(...try_search.keys()));
                // put the top route at the bottom of the array (for load balancing)
                routes.push(routes.splice(0, 1)[0]);
                return routes;
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=routing.js.map