import type { Router } from 'express';

const express = require('express') as typeof import('express');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createTourSchema,
  updateTourSchema,
  idSchema,
  listToursSchema,
  listTours,
  getTourById,
  createTour,
  updateTour,
} = require('../controllers/tourController');

const router: Router = express.Router();

router.get('/', validate(listToursSchema), listTours);
router.get('/:id', validate(idSchema), getTourById);
router.post('/', requireAuth, requireRole('admin'), validate(createTourSchema), createTour);
router.patch('/:id', requireAuth, requireRole('admin'), validate(updateTourSchema), updateTour);

module.exports = router;
