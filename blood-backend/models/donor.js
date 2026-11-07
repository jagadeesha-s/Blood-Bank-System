const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: true,
        trim: true
    },

    bloodGroup: {
        type: String,
        default: 'N/A'
    },

    phone: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    city: {
        type: String,
        required: true,
        trim: true
    },

    availability: {
        type: Boolean,
        default: true
    },

    role: {
        type: String,
        enum: ['donor', 'hospital'],
        default: 'donor'
    },

    donationCount: {
        type: Number,
        default: 0
    },

    licenseNumber: {
        type: String,
        trim: true,
        default: ''
    },

    language: {
        type: String,
        default: 'English'
    }
},
{
    timestamps: true
}
);

donorSchema.virtual('tier').get(function () {
    if (this.donationCount >= 5) return 'Diamond';
    if (this.donationCount >= 3) return 'Gold';
    if (this.donationCount >= 1) return 'Silver';
    return 'None';
});

donorSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Donor', donorSchema);