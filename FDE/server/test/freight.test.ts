import {describe,expect,it} from "vitest";
import {__freightTest} from "../src/services/freight.js";
describe("partner freight normalization",()=>{
 it("reads common response shape and preserves paise",()=>expect(__freightTest.parseInvoices({invoices:[{delivery_id:7,amount_paise:12345}],next_cursor:"next"})).toEqual({rows:[{deliveryId:7,amountPaise:12345,invoiceId:""}],cursor:"next"}));
 it("drops malformed and negative invoices",()=>expect(__freightTest.parseInvoices({data:[{delivery_id:"bad",amount_paise:2},{delivery_id:1,amount_paise:-2}]}).rows).toEqual([]));
});
