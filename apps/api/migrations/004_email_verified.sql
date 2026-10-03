-- La IA incluida exige un email verificado (P4.4). Hasta ahora sólo se guardaba el email si el proveedor lo daba por verificado.
ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
UPDATE users SET email_verified = (email IS NOT NULL);
