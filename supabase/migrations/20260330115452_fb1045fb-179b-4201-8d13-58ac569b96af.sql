CREATE POLICY "Admins can view all avisos_lidos"
ON public.avisos_lidos
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));