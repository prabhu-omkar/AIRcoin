package node
import "testing"
func TestGeohash(t *testing.T){ if g:=Geohash(12.9716,77.5946,9); g!="tdr1v9qtj" { t.Fatal(g) } }
