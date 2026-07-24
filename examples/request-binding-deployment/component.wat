(component
  (type $context-type
    (instance
      (type $read-type
        (func (param "table" u32) (param "key" u32) (result s32))
      )
      (export "read" (func (type $read-type)))
      (type $write-type
        (func (param "table" u32) (param "key" u32) (param "value" s32))
      )
      (export "write" (func (type $write-type)))
      (type $capability-type
        (func (param "capability" u32) (result s32))
      )
      (export "capability" (func (type $capability-type)))
    )
  )
  (import "lagrange:cell/context"
    (instance $context (type $context-type))
  )
  (alias export $context "read" (func $read))
  (core func $core-read (canon lower (func $read)))
  (alias export $context "write" (func $write))
  (core func $core-write (canon lower (func $write)))
  (alias export $context "capability" (func $capability))
  (core func $core-capability (canon lower (func $capability)))
  (core instance $context-instance
    (export "read" (func $core-read))
    (export "write" (func $core-write))
    (export "capability" (func $core-capability))
  )

  (core module $module
    (type $read-type (func (param i32 i32) (result i32)))
    (type $write-type (func (param i32 i32 i32)))
    (type $capability-type (func (param i32) (result i32)))
    (import "context" "read" (func $read (type $read-type)))
    (import "context" "write" (func $write (type $write-type)))
    (import "context" "capability"
      (func $capability (type $capability-type))
    )
    (memory $memory (export "memory") 1)
    (func $realloc (export "realloc")
      (param i32 i32 i32 i32)
      (result i32)
      i32.const 1024
    )
    (func $run (export "run")
      (param $request i32)
      (param $request-length i32)
      (result i32)
      local.get $request-length
      i32.const 9
      i32.gt_u
      if
        local.get $request
        i32.const 9
        i32.add
        i32.load8_u
        i32.const 100
        i32.eq
        if
          i32.const 1
          i32.const 7
          call $read
          drop
        else
          i32.const 0
          i32.const 7
          call $read
          drop
          i32.const 0
          i32.const 7
          i32.const 42
          call $write
        end
      end
      i32.const 0
    )
    (data (i32.const 0)
      "\08\00\00\00\6d\00\00\00"
      "\7b\22\62\6f\64\79\22\3a\22\63\6f\6d\70\6f\6e\65\6e\74"
      "\20\77\72\6f\74\65\20\61\75\64\69\74\20\6b\65\79\20\37"
      "\22\2c\22\68\65\61\64\65\72\73\22\3a\5b\5b\22\78\2d\6c"
      "\61\67\72\61\6e\67\65\2d\63\65\6c\6c\22\2c\22\72\65\71"
      "\75\65\73\74\2d\62\69\6e\64\69\6e\67\2d\65\78\61\6d\70"
      "\6c\65\22\5d\5d\2c\22\73\74\61\74\75\73\22\3a\32\30\32"
      "\7d"
    )
  )
  (core instance $instance
    (instantiate $module
      (with "context" (instance $context-instance))
    )
  )
  (alias core export $instance "memory" (core memory $memory))
  (alias core export $instance "realloc" (core func $realloc))
  (alias core export $instance "run" (core func $core-run))
  (type $run-type
    (func (param "request" string) (result string))
  )
  (func $run
    (type $run-type)
    (canon lift
      (core func $core-run)
      (memory $memory)
      (realloc $realloc)
    )
  )
  (export "run" (func $run))
)
