;; live-query-storage is a class which lets the live-query class store and access persisted queries
;; It will be used for testing, as a mock class. The real class will be a subclass of this one and will use a special
;; table in just the partition where the query is located (based in the WHERE clause)..
(defclass live-query-storage () ((queries :initarg :queries :accessor queries)))

;; 
(defclass live-query () ((query :initarg :query :accessor query)))
