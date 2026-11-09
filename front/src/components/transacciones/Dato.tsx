interface Props {
  id: string;
  etiqueta: string;
  valor: string;
}

// Par etiqueta/valor de un dato de transacción (detalle, resultado y comprobante).
export default function Dato({ id, etiqueta, valor }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <dt>{etiqueta}</dt>
      <dd data-testid={id} className="font-medium">
        {valor}
      </dd>
    </div>
  );
}
