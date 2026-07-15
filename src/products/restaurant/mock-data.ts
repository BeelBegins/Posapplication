import type { MenuItem, RestaurantOrder, RestaurantTable } from "./domain";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
export const floors = ["Ground Floor", "Terrace"];
export const tables: RestaurantTable[] = [
  ["G01","Table 1",4,"Occupied",3,"REST-1001",42], ["G02","Table 2",2,"Available",0,"",0],
  ["G03","Table 3",4,"Sent to kitchen",4,"REST-1003",25], ["G04","Table 4",6,"Bill requested",5,"REST-1004",68],
  ["G05","Table 5",2,"Available",0,"",0], ["G06","Table 6",4,"Needs attention",2,"REST-1006",38],
  ["G07","Table 7",8,"Partially served",7,"REST-1007",57], ["G08","Table 8",4,"Available",0,"",0],
  ["T01","T-01",2,"Available",0,"",0], ["T02","T-02",4,"Order pending",3,"REST-1010",31],
  ["T03","T-03",4,"Available",0,"",0], ["T04","T-04",6,"Payment pending",6,"REST-1012",84],
  ["T05","T-05",2,"Occupied",2,"REST-1013",16], ["T06","T-06",4,"Available",0,"",0],
  ["T07","T-07",8,"Sent to kitchen",6,"REST-1015",73], ["T08","T-08",4,"Available",0,"",0]
].map((x, index) => ({ id:String(x[0]), title:String(x[1]), floor:index<8?floors[0]:floors[1], capacity:Number(x[2]), status:x[3] as RestaurantTable["status"], guests:Number(x[4]), waiter:Number(x[4]) ? "Ayesha Khan" : "", orderName:String(x[5]) || undefined, amount:Number(x[6]), openedAt:Number(x[4]) ? ago([22,0,14,51,0,37,65,0,0,11,0,73,18,0,44,0][index]) : undefined }));

export const menu: MenuItem[] = [
  {code:"BRG-01",name:"Copper House Burger",description:"Smashed beef, cheddar and house relish",category:"Mains",price:890,available:true,prepMinutes:18,popular:true,station:"Grill",modifiers:[{title:"Cooking",required:true,options:[{code:"MED",label:"Medium",price:0},{code:"WELL",label:"Well done",price:0}]},{title:"Add-ons",multiple:true,options:[{code:"CHS",label:"Extra cheese",price:120},{code:"BAC",label:"Smoked beef",price:180}]}]},
  {code:"STK-01",name:"Charred Ribeye",description:"250g ribeye, herb butter and jus",category:"Mains",price:2450,available:true,prepMinutes:25,popular:true,station:"Grill",modifiers:[{title:"Cooking level",required:true,options:[{code:"MR",label:"Medium rare",price:0},{code:"MED",label:"Medium",price:0},{code:"MW",label:"Medium well",price:0},{code:"WD",label:"Well done",price:0}]}]},
  {code:"PIZ-01",name:"Fire-Roasted Margherita",description:"Tomato, mozzarella and basil",category:"Pizza",price:1050,available:true,prepMinutes:16,vegetarian:true,popular:true,station:"Pizza",modifiers:[{title:"Size",required:true,options:[{code:"REG",label:"Regular",price:0},{code:"LRG",label:"Large",price:420}]},{title:"Toppings",multiple:true,options:[{code:"ECH",label:"Extra cheese",price:150},{code:"OLV",label:"Olives",price:100},{code:"JAL",label:"Jalapeño",price:80}]}]},
  {code:"PIZ-02",name:"Spicy Pepperoni",description:"Pepperoni, chilli honey and mozzarella",category:"Pizza",price:1290,available:true,prepMinutes:18,spicy:true,station:"Pizza"},
  {code:"SAL-01",name:"Garden Burrata",description:"Tomatoes, rocket, basil oil",category:"Starters",price:760,available:true,prepMinutes:8,vegetarian:true,recent:true,station:"Cold Kitchen"},
  {code:"CHK-01",name:"Crispy Chicken Bites",description:"Buttermilk chicken and pepper glaze",category:"Starters",price:690,available:true,prepMinutes:12,spicy:true,popular:true,station:"Fryer"},
  {code:"PAS-01",name:"Truffle Alfredo",description:"Fettuccine, parmesan and truffle cream",category:"Mains",price:1180,available:true,prepMinutes:17,vegetarian:true,station:"Hot Kitchen"},
  {code:"DES-01",name:"Warm Chocolate Fondant",description:"Vanilla bean ice cream",category:"Desserts",price:620,available:true,prepMinutes:14,popular:true,station:"Pastry"},
  {code:"DRK-01",name:"Mint Lemonade",description:"Fresh lemon, mint and soda",category:"Drinks",price:340,available:true,prepMinutes:5,vegetarian:true,recent:true,station:"Bar",modifiers:[{title:"Size",required:true,options:[{code:"REG",label:"Regular",price:0},{code:"LRG",label:"Large",price:100}]}]},
  {code:"DRK-02",name:"Peach Iced Tea",description:"Black tea and white peach",category:"Drinks",price:390,available:true,prepMinutes:5,station:"Bar"},
  {code:"DRK-03",name:"Sparkling Water",description:"Chilled 500ml bottle",category:"Drinks",price:250,available:false,prepMinutes:1,station:"Bar"},
  {code:"SID-01",name:"Parmesan Fries",description:"Crisp fries, parmesan and herbs",category:"Sides",price:420,available:true,prepMinutes:8,vegetarian:true,station:"Fryer"}
];

const line = (id:string, code:string, name:string, qty:number, rate:number, status:RestaurantOrder["lines"][number]["kitchenStatus"], station:string, sent=qty) => ({id,itemCode:code,itemName:name,uom:"Nos",quantity:qty,sentQuantity:sent,rate,notes:"",modifiers:[],kitchenStatus:status,station,addedAt:ago(20)});
export const orders: RestaurantOrder[] = [
  {name:"REST-1001",branch:"Main Branch",floor:floors[0],table:"G01",waiter:"Ayesha Khan",guestCount:3,status:"Open",posInvoice:null,modified:ago(4),openedAt:ago(42),lines:[line("l1","SAL-01","Garden Burrata",1,760,"Served","Cold Kitchen"),line("l2","BRG-01","Copper House Burger",2,890,"Preparing","Grill")]},
  {name:"REST-1003",branch:"Main Branch",floor:floors[0],table:"G03",waiter:"Ayesha Khan",guestCount:4,status:"Sent to Kitchen",posInvoice:null,modified:ago(5),openedAt:ago(25),lines:[line("l3","PIZ-01","Fire-Roasted Margherita",2,1050,"Queued","Pizza"),line("l4","DRK-01","Mint Lemonade",4,340,"Ready","Bar")]},
  {name:"REST-1004",branch:"Main Branch",floor:floors[0],table:"G04",waiter:"Ayesha Khan",guestCount:5,status:"Bill Requested",posInvoice:null,modified:ago(2),openedAt:ago(51),lines:[line("l5","STK-01","Charred Ribeye",2,2450,"Served","Grill"),line("l6","PAS-01","Truffle Alfredo",2,1180,"Served","Hot Kitchen")]},
  {name:"REST-1006",branch:"Main Branch",floor:floors[0],table:"G06",waiter:"Ayesha Khan",guestCount:2,status:"Sent to Kitchen",posInvoice:null,modified:ago(18),openedAt:ago(37),lines:[line("l7","BRG-01","Copper House Burger",2,890,"Preparing","Grill"),line("l8","SID-01","Parmesan Fries",1,420,"Ready","Fryer")]},
  {name:"REST-1010",branch:"Main Branch",floor:floors[1],table:"T02",waiter:"Ayesha Khan",guestCount:3,status:"Open",posInvoice:null,modified:ago(1),openedAt:ago(11),lines:[line("l9","PIZ-02","Spicy Pepperoni",1,1290,"Not sent","Pizza",0)]}
];
