-- A weekly slot booked and paid from the wallet automatically when next week's round opened.
ALTER TYPE "NotificationType" ADD VALUE 'SLOT_AUTO_BOOKED' AFTER 'SLOT_HELD';
