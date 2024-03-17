import { match, P } from "ts-pattern";
import { BaseSchema, object, string, intersect, array, never } from "valibot";

type SliceSchema =
  | (TextSliceSchema & { type: "text" })
  | (DataSliceSchema & { type: "data" })
  | (MultiSliceSchema & { type: "multi" })
  | (ArraySliceSchema & { type: "array" })
  | (ObjectSliceSchema & { type: "object" });

type WithKey<T> = {
  key: string;
} & T;

type TextKV = WithKey<{}>;

type DataKV = WithKey<{
  schema: BaseSchema;
}>;

function fromText(text: TextKV): BaseSchema {
  return object({ [text.key]: string() });
}

function fromData(data: DataKV): BaseSchema {
  return object({ [data.key]: data.schema });
}

type TextSliceSchema = TextKV;

export function textSlice(key: string): SliceSchema {
  return {
    key,
    type: "text",
  };
}

type DataSliceSchema = DataKV;

export function dataSlice(key: string, schema: BaseSchema): SliceSchema {
  return {
    key,
    schema,
    type: "data",
  };
}

type MultiSliceSchema = {
  main: ({ type: "text" } & TextKV) | ({ type: "data" } & DataKV);
  others: [DataKV, ...DataKV[]];
};

function dataTupleToPair(tuple: [string, BaseSchema]): DataKV {
  return {
    key: tuple[0],
    schema: tuple[1],
  };
}

export function textMultiSlice(
  key: string,
  others: [[string, BaseSchema], ...[string, BaseSchema][]]
): SliceSchema {
  return {
    type: "multi",
    main: {
      type: "text",
      key,
    },
    others: [
      dataTupleToPair(others[0]),
      ...others.slice(1).map((tuple) => dataTupleToPair(tuple)),
    ],
  };
}

export function dataMultiSlice(
  key: string,
  schema: BaseSchema,
  others: [[string, BaseSchema], ...[string, BaseSchema][]]
): SliceSchema {
  return {
    type: "multi",
    main: {
      type: "data",
      key,
      schema,
    },
    others: [
      dataTupleToPair(others[0]),
      ...others.slice(1).map((tuple) => dataTupleToPair(tuple)),
    ],
  };
}

type ArraySliceSchema = WithKey<{
  child: SliceSchema;
}>;

export function arraySlice(key: string, slice: SliceSchema): SliceSchema {
  return {
    type: "array",
    key,
    child: slice,
  };
}

type ObjectSliceSchema = WithKey<{
  children: [SliceSchema, ...SliceSchema[]];
}>;

export function objectSlice(
  key: string,
  slices: [SliceSchema, ...SliceSchema[]]
): SliceSchema {
  return {
    type: "object",
    key,
    children: slices,
  };
}

export function buildSchema(sliceSchema: SliceSchema): BaseSchema {
  return match(sliceSchema)
    .with({ type: "text" }, fromText)
    .with({ type: "data" }, fromData)
    .with({ type: "array" }, (arr) =>
      object({ [arr.key]: array(buildSchema(arr.child)) })
    )
    .with({ type: "object" }, (obj) =>
      object({
        [obj.key]: match(obj.children.length)
          .with(0, () => never())
          .with(1, () => buildSchema(obj.children[0]))
          .with(P._, () =>
            intersect([
              buildSchema(obj.children[0]),
              buildSchema(obj.children[1]),
              ...obj.children.slice(2).map((slice) => buildSchema(slice)),
            ])
          )
          .exhaustive(),
      })
    )
    .with({ type: "multi" }, (multi) =>
      intersect([
        match(multi.main)
          .with({ type: "text" }, fromText)
          .with({ type: "data" }, fromData)
          .exhaustive(),
        fromData(multi.others[0]),
        ...multi.others.slice(1).map((datakv) => fromData(datakv)),
      ])
    )
    .exhaustive();
}
