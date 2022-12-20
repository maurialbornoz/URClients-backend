const User = require('../models/User')
const Product = require('../models/Product')
const Client = require('../models/Client')
const Order = require('../models/Order')
const bcryptjs = require('bcryptjs')
const jwt = require('jsonwebtoken')
require('dotenv').config({path: 'variables.env'})

const createToken = (user, secret, expiresIn) => {
    const {id, name, lastname, email} = user
    return jwt.sign({id, name, lastname, email}, secret, {expiresIn})
}

// Resolvers
const resolvers = {
    Query: {
        getUser: async(_, {}, ctx) => {
            return ctx.user
        },

        getProducts: async() => {
            try {
                const products = await Product.find({})
                return products
            } catch (error) {
                console.log(error)
            }
        },

        getProduct: async(_, {id}) => {
            // check if product exists
            const product = await Product.findById(id)
            if(!product){
                throw new Error('Product not found')
            }
            return product
        },

        getClients: async() => {
            try {
                const clients = await Client.find({})
                return clients
            } catch (error) {
                console.log(error)
            }
        },
        
        getSellerClients: async(_, {}, ctx) => {
            try {
                const clients = await Client.find({seller : ctx.user.id.toString()})
                return clients
            } catch (error) {
                console.log(error)
            }
            
        },

        getClient: async(_, {id}, ctx) => {
            // check if client exists
            const client = await Client.findById(id)
            if(!client) {
                throw new Error('Client not found')
            }
            // only the seller owner can see the client
            if(client.seller.toString() !== ctx.user.id){
                throw new Error('Invalid Credentials')

            }
            return client

        },

        getOrders: async() => {
            try {
                const orders = Order.find({})
                return orders
            } catch (error) {
                console.log(error)
            }
        },
        
        getSellerOrders: async(_, {}, ctx) => {
            try {
                const orders = Order.find({seller : ctx.user.id}).populate('client')
                console.log(orders)
                return orders
            } catch (error) {
                console.log(error)
            }

        },

        getOrder: async(_, {id}, ctx) => {
            // check if order exists
            const order = await Order.findById(id)
            if(!order){
                throw new Error('Order not found')
            }
            
            // only the owner can see the order
            if(order.seller.toString() !== ctx.user.id){
                throw new Error('Invalid Credentials')
            }

            return order

        },

        getOrdersByState: async(_, {state}, ctx) => {
            const orders = await Order.find({seller: ctx.user.id, state})
            return orders
        },

        bestClients: async() => {
            const clients = await Order.aggregate([
                {$match : {state : "COMPLETED" }},
                { $group : {
                    _id: "$client",
                    total: {$sum: '$total'}
                }},
                {
                    $lookup: {
                        from: 'clients',
                        localField: '_id',
                        foreignField: '_id',
                        as: "client"
                    }
                },
                {
                    $limit: 10
                },
                {
                    $sort: { total : -1 }
                }
            ])

            return clients
        },

        bestSellers: async() => {
            const sellers = await Order.aggregate([
                {$match : {state : "COMPLETED" }},
                { $group : {
                    _id: "$seller",
                    total: {$sum: '$total'}
                }},
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: "seller"
                    }
                },
                {
                    $limit: 3
                },
                {
                    $sort: { total : -1 }
                }
            ])

            return sellers
        },

        searchProduct: async(_, {text}) => {
            const products = await Product.find({$text: {$search: text}}).limit(10)
            return products
        }
    },
    Mutation : {
        newUser: async(_, {input}) => {
            const {email, password} = input
            // check if user is already registered
            const userExists = await User.findOne({email})
            if(userExists){
                throw new Error('User is already registered')
            }
            // hash password
            const salt = await bcryptjs.genSalt(10)
            input.password = await bcryptjs.hash(password, salt)
            
            // save 
            try {
                const user = new User(input)
                user.save()
                return user
            } catch (error) {
                console.log(error)
            }
        },

        authenticateUser: async(_, {input}) => {
            const {email, password} = input
            // check if user already exists
            const userExists = await User.findOne({email})
            if(!userExists){
                throw new Error('Invalid Credentials')
            }
            // check if password if correct
            const correctPassword = await bcryptjs.compare(password, userExists.password)
            if(!correctPassword){
                throw new Error('Invalid Credentials')
            }
            // create token
            return {
                token: createToken(userExists, process.env.SECRET, '24h')
            }
        },

        newProduct: async(_, {input}) => {
            try {
                const product = new Product(input)
                const result = await product.save()
                return result
            } catch (error) {
                console.log(error)
            }
        },

        updateProduct: async(_, {id, input}) => {
            // check if product exists
            let product = await Product.findById(id)
            if(!product){
                throw new Error('Product not found')
            }

            product = await Product.findOneAndUpdate({_id : id}, input, { new: true })
           
            return product
        },

        deleteProduct: async(_, {id}) => {
            // check if product exists
            let product = await Product.findById(id)
            if(!product){
                throw new Error('Product not found')
            }
            
            await Product.findOneAndDelete({_id : id})
            return "Product removed"
        },

        newClient: async(_, {input}, ctx) => {
            //console.log(ctx)
            // check if client is already registered
            // console.log(input)
            const {email} = input
            const client = await Client.findOne({email})
            if(client){
                throw new Error('Client is already registered')
            }
            // assign seller 
            const newClient = new Client(input)
            newClient.seller = ctx.user.id

            try {
                const result = await newClient.save()
                return result
                
            } catch (error) {
                console.log(error)
            }
        },

        updateClient: async(_, {id, input}, ctx) => {
            // check if client exists
            let client = await Client.findById(id)
            if(!client){
                throw new Error('Client not found')
            }
            // check if editor is seller owner
            if(client.seller.toString() !== ctx.user.id){
                throw new Error('Invalid Credentials')
            }

            client = await Client.findOneAndUpdate({_id: id}, input, {new:true})
            return client

        },

        deleteClient: async(_, {id}, ctx) => {
            // check if client exists
            let client = await Client.findById(id)
            if(!client){
                throw new Error('Client not found')
            }
            // check if editor is seller owner
            if(client.seller.toString() !== ctx.user.id){
                throw new Error('Invalid Credentials')
            }

            await Order.deleteMany({ client: id })
            await Client.findOneAndDelete({_id : id})
            return "Client removed"
        },

        newOrder: async(_, {input}, ctx) => {
            // console.log(input)
            const {client} = input

            // check if the client exists 
            let clientExists = await Client.findById(client)
            if(!clientExists){
                throw new Error('Client not found')
            }

            // check if the seller owns the client
            if(clientExists.seller.toString() !== ctx.user.id){
                throw new Error('Invalid Credentials')
            }

            // check stock
            for await (const order of input.order) {
                const {id} = order
                const product = await Product.findById(id)

                if(order.amount > product.existence) {
                    throw new Error(`The article ${product.name} exceeds the available quantity`)
                } else {
                    // reduce available quantity
                    product.existence = product.existence - order.amount
                    await product.save()
                }
            }

            // create a new order
            const newOrder = new Order(input)

            // assign seller
            newOrder.seller = ctx.user.id

            const result = await newOrder.save()
            return result
        },

        updateOrder: async(_, {id, input}, ctx) => {
            const {client} = input

            // check if order exists
            const orderExists = await Order.findById(id)
            if(!orderExists){
                throw new Error('Order not found')
            }
            
            // check if client exists
            const clientExists = await Client.findById(client)
            if(!clientExists){
                throw new Error('Client not found')
            }

            // check if the seller owns the client and the order 
            if(clientExists.seller.toString() !== ctx.user.id){
                throw new Error('Invalid Credentials')
            }

            // check stock
            if(input.order){

                for await (const order of input.order) {
                    const {id} = order
                    const product = await Product.findById(id)
    
                    if(order.amount > product.existence) {
                        throw new Error(`The article ${product.name} exceeds the available quantity`)
                    } else {
                        // reduce available quantity
                        product.existence = product.existence - order.amount
                        await product.save()
                    }
                }
            }

            const result = await Order.findOneAndUpdate({_id : id}, input, {new : true})
            return result
        },

        deleteOrder: async(_, {id}, ctx) => {
            // check if order exists
            const order = await Order.findById(id)
            if(!order){
                throw new Error('Order not found')
            }
            
            // check if the owner is trying to delete the order
            if(order.seller.toString() !== ctx.user.id){
                throw new Error('Invalid Credentials')
            }

            await Order.findOneAndDelete({_id : id})
            return "Order removed"

        }
        
    }
}

module.exports = resolvers