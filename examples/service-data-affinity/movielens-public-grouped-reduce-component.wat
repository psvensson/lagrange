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
    (func $sum-address (param $movie i32) (result i32)
      i32.const 4096
      local.get $movie
      i32.const 2
      i32.shl
      i32.add
    )
    (func $count-address (param $movie i32) (result i32)
      i32.const 12288
      local.get $movie
      i32.const 2
      i32.shl
      i32.add
    )
    (func $matches-marker
      (param $cursor i32)
      (param $end i32)
      (param $marker i32)
      (param $marker-length i32)
      (result i32)
      (local $index i32)
      local.get $cursor
      local.get $marker-length
      i32.add
      local.get $end
      i32.gt_u
      if
        i32.const 0
        return
      end
      (block $matched
        (loop $match
          local.get $index
          local.get $marker-length
          i32.ge_u
          br_if $matched
          local.get $cursor
          local.get $index
          i32.add
          i32.load8_u
          local.get $marker
          local.get $index
          i32.add
          i32.load8_u
          i32.ne
          if
            i32.const 0
            return
          end
          local.get $index
          i32.const 1
          i32.add
          local.set $index
          br $match
        )
      )
      i32.const 1
    )
    (func $marker-count
      (param $request i32)
      (param $request-length i32)
      (param $marker i32)
      (param $marker-length i32)
      (result i32)
      (local $cursor i32)
      (local $end i32)
      (local $count i32)
      local.get $request
      local.set $cursor
      local.get $request
      local.get $request-length
      i32.add
      local.set $end
      (block $complete
        (loop $scan
          local.get $cursor
          local.get $end
          i32.ge_u
          br_if $complete
          local.get $cursor
          local.get $end
          local.get $marker
          local.get $marker-length
          call $matches-marker
          if
            local.get $count
            i32.const 1
            i32.add
            local.set $count
          end
          local.get $cursor
          i32.const 1
          i32.add
          local.set $cursor
          br $scan
        )
      )
      local.get $count
    )
    (func $result-key-offset
      (param $request i32)
      (param $request-length i32)
      (result i32)
      (local $cursor i32)
      (local $end i32)
      (local $character i32)
      (local $value i32)
      (local $digits i32)
      local.get $request
      local.get $request-length
      i32.add
      local.set $end

      local.get $request
      local.get $end
      i32.const 512
      i32.const 117
      call $matches-marker
      i32.eqz
      if
        unreachable
      end
      local.get $request
      i32.const 117
      i32.add
      local.set $cursor
      (block $digits-complete
        (loop $digits
          local.get $cursor
          local.get $end
          i32.ge_u
          br_if $digits-complete
          local.get $cursor
          i32.load8_u
          local.tee $character
          i32.const 48
          i32.lt_u
          br_if $digits-complete
          local.get $character
          i32.const 57
          i32.gt_u
          br_if $digits-complete
          local.get $value
          i32.const 214748363
          i32.gt_u
          if
            unreachable
          end
          local.get $value
          i32.const 10
          i32.mul
          local.get $character
          i32.const 48
          i32.sub
          i32.add
          local.tee $value
          i32.const 2147483630
          i32.gt_u
          if
            unreachable
          end
          local.get $digits
          i32.const 1
          i32.add
          local.set $digits
          local.get $cursor
          i32.const 1
          i32.add
          local.set $cursor
          br $digits
        )
      )
      local.get $digits
      i32.eqz
      if
        unreachable
      end
      local.get $digits
      i32.const 1
      i32.gt_u
      if
        local.get $request
        i32.const 117
        i32.add
        i32.load8_u
        i32.const 48
        i32.eq
        if
          unreachable
        end
      end
      local.get $value
      i32.const 10
      i32.rem_u
      i32.eqz
      if
      else
        unreachable
      end
      local.get $cursor
      local.get $end
      i32.const 768
      i32.const 58
      call $matches-marker
      i32.eqz
      if
        unreachable
      end
      local.get $value
    )
    (func $score (param $movie i32) (result f64)
      (local $count i32)
      local.get $movie
      call $count-address
      i32.load
      local.tee $count
      i32.eqz
      if (result f64)
        f64.const -1
      else
        local.get $movie
        call $sum-address
        i32.load
        f64.convert_i32_u
        f64.const 87.5
        f64.add
        local.get $count
        f64.convert_i32_u
        f64.const 25
        f64.add
        f64.div
        f64.const 0.5
        local.get $count
        f64.convert_i32_u
        f64.sqrt
        f64.div
        f64.sub
      end
    )
    (func $was-selected (param $movie i32) (param $rank i32) (result i32)
      (local $index i32)
      (block $not-selected
        (loop $scan
          local.get $index
          local.get $rank
          i32.ge_u
          br_if $not-selected
          i32.const 20480
          local.get $index
          i32.const 2
          i32.shl
          i32.add
          i32.load
          local.get $movie
          i32.eq
          if
            i32.const 1
            return
          end
          local.get $index
          i32.const 1
          i32.add
          local.set $index
          br $scan
        )
      )
      i32.const 0
    )
    (func $run (export "run")
      (param $request i32)
      (param $request-length i32)
      (result i32)
      (local $row-count i32)
      (local $key i32)
      (local $packed i32)
      (local $movie i32)
      (local $rating i32)
      (local $rank i32)
      (local $best-movie i32)
      (local $result-offset i32)
      (local $candidate-score f64)
      (local $best-score f64)

      local.get $request
      local.get $request-length
      call $result-key-offset
      local.set $result-offset
      i32.const 1
      local.set $movie
      (block $clear-complete
        (loop $clear
          local.get $movie
          i32.const 2047
          i32.gt_u
          br_if $clear-complete
          local.get $movie
          call $sum-address
          i32.const 0
          i32.store
          local.get $movie
          call $count-address
          i32.const 0
          i32.store
          local.get $movie
          i32.const 1
          i32.add
          local.set $movie
          br $clear
        )
      )
      i32.const 0
      i32.const 0
      call $read
      local.set $row-count
      i32.const 1
      local.set $key
      (block $ratings-complete
        (loop $ratings
          local.get $key
          local.get $row-count
          i32.gt_u
          br_if $ratings-complete
          i32.const 0
          local.get $key
          call $read
          local.tee $packed
          i32.const 3
          i32.shr_u
          local.tee $movie
          i32.const 2047
          i32.le_u
          if
            local.get $movie
            i32.eqz
            if
            else
              local.get $packed
              i32.const 7
              i32.and
              local.tee $rating
              i32.eqz
              if
              else
                local.get $movie
                call $sum-address
                local.get $movie
                call $sum-address
                i32.load
                local.get $rating
                i32.add
                i32.store
                local.get $movie
                call $count-address
                local.get $movie
                call $count-address
                i32.load
                i32.const 1
                i32.add
                i32.store
              end
            end
          end
          local.get $key
          i32.const 1
          i32.add
          local.set $key
          br $ratings
        )
      )

      (block $ranking-complete
        (loop $ranking
          local.get $rank
          i32.const 10
          i32.ge_u
          br_if $ranking-complete
          i32.const 0
          local.set $best-movie
          f64.const -1
          local.set $best-score
          i32.const 1
          local.set $movie
          (block $scan-complete
            (loop $scan
              local.get $movie
              i32.const 2047
              i32.gt_u
              br_if $scan-complete
              local.get $movie
              local.get $rank
              call $was-selected
              i32.eqz
              if
                local.get $movie
                call $score
                local.tee $candidate-score
                local.get $best-score
                f64.gt
                if
                  local.get $candidate-score
                  local.set $best-score
                  local.get $movie
                  local.set $best-movie
                end
              end
              local.get $movie
              i32.const 1
              i32.add
              local.set $movie
              br $scan
            )
          )
          i32.const 20480
          local.get $rank
          i32.const 2
          i32.shl
          i32.add
          local.get $best-movie
          i32.store
          i32.const 1
          local.get $result-offset
          local.get $rank
          i32.const 1
          i32.add
          i32.add
          local.get $best-movie
          call $write
          i32.const 2
          local.get $result-offset
          local.get $rank
          i32.const 1
          i32.add
          i32.add
          local.get $best-score
          f64.const 1000000
          f64.mul
          i32.trunc_f64_s
          call $write
          local.get $rank
          i32.const 1
          i32.add
          local.set $rank
          br $ranking
        )
      )
      i32.const 0
    )
    (data (i32.const 0)
      "\08\00\00\00\7c\00\00\00"
      "\7b\22\62\6f\64\79\22\3a\22\4d\6f\76\69\65\4c\65\6e"
      "\73\20\67\72\6f\75\70\65\64\20\72\65\64\75\63\65\20"
      "\63\6f\6d\70\6c\65\74\65\64\22\2c\22\68\65\61\64\65"
      "\72\73\22\3a\5b\5b\22\78\2d\6c\61\67\72\61\6e\67\65"
      "\2d\63\65\6c\6c\22\2c\22\6d\6f\76\69\65\6c\65\6e\73"
      "\2d\70\75\62\6c\69\63\2d\67\72\6f\75\70\65\64\2d\72"
      "\65\64\75\63\65\22\5d\5d\2c\22\73\74\61\74\75\73\22"
      "\3a\32\30\30\7d"
    )
    (data (i32.const 512)
      "\7b\22\62\6f\64\79\22\3a\7b\22\64\61\74\61\73\65\74\44"
      "\69\67\65\73\74\22\3a\22\73\68\61\32\35\36\3a\30\36\34"
      "\31\36\65\35\39\37\66\38\32\62\37\33\34\32\33\36\31\65"
      "\34\31\31\36\33\38\39\30\63\38\31\30\33\36\39\30\30\66"
      "\34\31\38\61\64\39\31\33\31\35\35\39\30\38\31\34\32\31"
      "\31\64\63\61\34\39\30\22\2c\22\72\65\73\75\6c\74\4b\65"
      "\79\4f\66\66\73\65\74\22\3a"
    )
    (data (i32.const 768)
      "\2c\22\77\6f\72\6b\6c\6f\61\64\56\65\72\73\69\6f\6e\22"
      "\3a\22\6d\6f\76\69\65\6c\65\6e\73\2d\70\75\62\6c\69\63"
      "\2d\72\65\71\75\65\73\74\2d\77\6f\72\6b\6c\6f\61\64\2d"
      "\76\31\22\7d"
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
