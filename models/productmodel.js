const mongoose = require("mongoose");

const productSchema = mongoose.Schema({
 title: {
        type: String,
        required: true,
 
    },
    description: {
        type: String,
 
    },
   category: {
  type:String ,
  ref: "Category",
  required: true,
},
    price: {
        type: Number,
        required: true
    },
    discountPercent: Number,
    rating: Number,
    stock: Number,
    brand: {
        type:String,
        
    },
    warrantyInformation: String,
    returnPolicy: String,
    thumbnail: {
        type:String,
        required: true,
    },
    images: {
        type: [String]
    },
 
},{timestamps: true})
 
const Products = mongoose.model("Products", productSchema);
module.exports = Products ;
