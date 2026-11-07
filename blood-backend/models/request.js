const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema(
    {
        hospitalName: { type: String, required: true, trim: true },
        bloodGroup:   { type: String, required: true },
        units:        { type: Number, required: true, min: 1 },
        urgency:      { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
        location:     { type: String, required: true, trim: true },
        status:       { type: String, enum: ['pending', 'accepted', 'fulfilled', 'cancelled'], default: 'pending' },
        phone:        { type: String, trim: true },
        notes:        { type: String, trim: true },
        // Donor who accepted this request
        acceptedBy: {
            donorId:   { type: String, default: '' },
            donorName: { type: String, default: '' },
            donorPhone:{ type: String, default: '' },
            donorEmail:{ type: String, default: '' }
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Request', requestSchema);
